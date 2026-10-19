// Expressions that bind a block's setting to parameters: `fc`, `-3 - snr`,
// `1 / (2 * pi * sqrt(L * C))`. Numbers, names, + - * / ^, parentheses and a
// few functions. Parsed here rather than handed to eval, which the site's
// Content-Security-Policy forbids anyway.
const FUNCTIONS = {
    sqrt: Math.sqrt,
    abs: Math.abs,
    exp: Math.exp,
    ln: Math.log,
    log10: Math.log10,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    round: Math.round,
    floor: Math.floor,
    ceil: Math.ceil,
    min: Math.min,
    max: Math.max,
    /** A power ratio in dB. */
    db: (ratio) => 10 * Math.log10(ratio),
    /** The power ratio for a level in dB. */
    fromdb: (db) => 10 ** (db / 10),
};
const CONSTANTS = { pi: Math.PI, e: Math.E };
/**
 * Names a parameter can't take, because expressions already mean something by
 * them.
 */
export function isParameterName(name) {
    return (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) &&
        !(name in FUNCTIONS) &&
        !(name in CONSTANTS));
}
class Parser {
    #text;
    #at = 0;
    constructor(text) {
        this.#text = text;
    }
    parse() {
        const expression = this.#sum();
        this.#space();
        if (this.#at < this.#text.length) {
            this.#fail(`Unexpected "${this.#text.slice(this.#at)}"`);
        }
        return expression;
    }
    #fail(message) {
        throw { expressionError: message };
    }
    #space() {
        while (/\s/.test(this.#text[this.#at] ?? '')) {
            this.#at++;
        }
    }
    #take(symbol) {
        this.#space();
        if (this.#text.startsWith(symbol, this.#at)) {
            this.#at += symbol.length;
            return true;
        }
        return false;
    }
    #sum() {
        let left = this.#product();
        for (;;) {
            const operator = this.#take('+')
                ? '+'
                : this.#take('-')
                    ? '-'
                    : undefined;
            if (!operator) {
                return left;
            }
            left = { kind: 'binary', operator, left, right: this.#product() };
        }
    }
    #product() {
        let left = this.#unary();
        for (;;) {
            const operator = this.#take('*')
                ? '*'
                : this.#take('/')
                    ? '/'
                    : undefined;
            if (!operator) {
                return left;
            }
            left = { kind: 'binary', operator, left, right: this.#unary() };
        }
    }
    #unary() {
        if (this.#take('-')) {
            return { kind: 'negate', argument: this.#unary() };
        }
        if (this.#take('+')) {
            return this.#unary();
        }
        return this.#power();
    }
    #power() {
        const base = this.#atom();
        // Right-associative, and binding tighter than a leading minus: -2^2 is -4.
        return this.#take('^')
            ? { kind: 'binary', operator: '^', left: base, right: this.#unary() }
            : base;
    }
    #atom() {
        this.#space();
        const rest = this.#text.slice(this.#at);
        const number = /^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(rest);
        if (number) {
            this.#at += number[0].length;
            return { kind: 'number', value: Number(number[0]) };
        }
        const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
        if (name) {
            this.#at += name[0].length;
            if (!this.#take('(')) {
                return { kind: 'name', name: name[0] };
            }
            const args = [];
            if (!this.#take(')')) {
                do {
                    args.push(this.#sum());
                } while (this.#take(','));
                if (!this.#take(')')) {
                    this.#fail(`Expected ) to close ${name[0]}(`);
                }
            }
            return { kind: 'call', name: name[0], args };
        }
        if (this.#take('(')) {
            const inner = this.#sum();
            if (!this.#take(')')) {
                this.#fail('Expected )');
            }
            return inner;
        }
        this.#fail(rest
            ? `Expected a number, a name or ( at "${rest}"`
            : 'The expression ends too soon');
    }
}
const isFailure = (value) => typeof value === 'object' && value !== null && 'expressionError' in value;
export function parseExpression(text) {
    try {
        return { ok: true, value: new Parser(text).parse() };
    }
    catch (error) {
        if (isFailure(error)) {
            return { ok: false, error: error.expressionError };
        }
        throw error;
    }
}
/**
 * `text` with each name in `renames` replaced, all at once, by what it maps
 * to: another name, or an expression in parentheses. Only whole names change,
 * never part of a longer one or of a number such as 1e5.
 */
export function renameIn(text, renames) {
    return text.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (name, at) => /[0-9.]$/.test(text.slice(0, at)) ? name : (renames.get(name) ?? name));
}
/** Every parameter name the expression uses. */
export function namesIn(expression) {
    switch (expression.kind) {
        case 'number':
            return [];
        case 'name':
            return expression.name in CONSTANTS ? [] : [expression.name];
        case 'negate':
            return namesIn(expression.argument);
        case 'binary':
            return [...namesIn(expression.left), ...namesIn(expression.right)];
        case 'call':
            return expression.args.flatMap(namesIn);
    }
}
function evaluateTree(expression, lookup) {
    switch (expression.kind) {
        case 'number':
            return expression.value;
        case 'name': {
            const value = lookup(expression.name) ?? CONSTANTS[expression.name];
            if (value === undefined) {
                throw {
                    expressionError: `No parameter is called "${expression.name}"`,
                };
            }
            return value;
        }
        case 'negate':
            return -evaluateTree(expression.argument, lookup);
        case 'binary': {
            const left = evaluateTree(expression.left, lookup);
            const right = evaluateTree(expression.right, lookup);
            switch (expression.operator) {
                case '+':
                    return left + right;
                case '-':
                    return left - right;
                case '*':
                    return left * right;
                case '/':
                    return left / right;
                case '^':
                    return left ** right;
            }
        }
        case 'call': {
            const fn = FUNCTIONS[expression.name];
            if (!fn) {
                throw { expressionError: `There is no function "${expression.name}"` };
            }
            return fn(...expression.args.map((arg) => evaluateTree(arg, lookup)));
        }
    }
}
/** Parses and evaluates `text`, looking parameter names up with `lookup`. */
export function evaluate(text, lookup) {
    const parsed = parseExpression(text);
    if (!parsed.ok) {
        return parsed;
    }
    try {
        const value = evaluateTree(parsed.value, lookup);
        return Number.isFinite(value)
            ? { ok: true, value }
            : { ok: false, error: `"${text}" is not a finite number` };
    }
    catch (error) {
        if (isFailure(error)) {
            return { ok: false, error: error.expressionError };
        }
        throw error;
    }
}
