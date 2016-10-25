/* jshint ignore:start */
'use strict';

var call = Function.prototype.call;
var slice = call.bind(Array.prototype.slice);

//////////
// MOCK //
//////////

/**
 * @param {Object} [object] An object to fallback for unmatched method
 *     invocations.
 * @param {boolean} [mockAny] Indicates whether to create method if expectation
 *     does not exist.
 * @returns {Proxy} A proxy.
 */
function mock(object, mockAny) {
    if (typeof object === 'undefined') {
        object = {};
    }

    Object.defineProperties(object, {
        __expectations__: {
            value: Object.create(null)
        },
        __invocations__: {
            value: Object.create(null)
        }
    });

    return new Proxy(object, {
        get: function (target, name) {
            var expectationGroups = target.__expectations__;

            if (expectationGroups && name in expectationGroups) {
                return function () {
                    return mockedMethod.call(this, target, name, arguments);
                };
            } else if (mockAny && !(name in target)) {
                return function () {
                    return spiedMethod.call(this, target, name, function () { }, arguments);
                };
            } else {
                return target[name];
            }
        }
    });
}

module.exports = exports = mock;

function when(mocker, options) {
    return new Proxy({}, {
        get: function (target, name) {
            return createExpectationMethod(mocker, name, 'mock', options || {});
        }
    });
}

exports.when = when;

function whenever(mocker) {
    return when(mocker, { repeat: Infinity });
}

exports.whenever = whenever;

////////////
// MOCKED //
////////////

function mockedMethod(target, name, args) {
    var expectation = matchExpectation(
        target.__expectations__[name],
        args
    );

    if (!expectation) {
        throw new TypeError('No expectation of method "' + name + '" matches given arguments available');
    }

    expectation.hit++;

    var invocationsMap = target.__invocations__;
    var invocations = invocationsMap[name] || (invocationsMap[name] = []);

    invocations.push({
        args: args
    });

    if (typeof expectation.then === 'function') {
        return expectation.then.apply(this, args);
    } else if (expectation.error) {
        throw expectation.error.value;
    } else {
        return expectation.value;
    }
}

/////////
// SPY //
/////////

function spy(object) {
    Object.defineProperties(object, {
        __expectations__: {
            value: Object.create(null)
        },
        __invocations__: {
            value: Object.create(null)
        }
    });

    return new Proxy(object, {
        get: function (target, name) {
            var value = target[name];

            if (typeof value === 'function') {
                return function () {
                    return spiedMethod.call(this, target, name, value, arguments);
                };
            } else {
                return value;
            }
        }
    });
}

exports.spy = spy;

function expect(spy, options) {
    return new Proxy({}, {
        get: function (target, name) {
            return createExpectationMethod(spy, name, 'spy', options || {});
        }
    });
}

exports.expect = expect;

///////////
// SPIED //
///////////

function spiedMethod(target, name, method, args) {
    var expectation = matchExpectation(
        target.__expectations__[name],
        args
    );

    if (expectation) {
        expectation.hit++;
    }

    var invocationsMap = target.__invocations__;
    var invocations = invocationsMap[name] || (invocationsMap[name] = []);

    invocations.push({
        args: args
    });

    return method.apply(this, args);
}

////////////
// SHARED //
////////////

function verify(object, options) {
    var verifyExpectations;

    if (typeof options === 'boolean') {
        verifyExpectations = options;
        options = undefined;
    }

    if (verifyExpectations && object.__expectations__) {
        for (var name in object.__expectations__) {
            var expectations = object.__expectations__[name];

            for (var i = 0; i < expectations.length; i++) {
                var expectation = expectations[i];
                validateRepetition(name, expectation);
            }
        }
    }

    return new Proxy({}, {
        get: function (target, name) {
            return createVerificationMethod(object, name, options || {});
        }
    });
}

exports.verify = verify;

function ExpectationQuery(expectation) {
    this._expectation = expectation;
}

ExpectationQuery.prototype.return = function (value) {
    this._expectation.value = value;
};

ExpectationQuery.prototype.throw = function (error) {
    this._expectation.error = {
        value: error
    };
};

ExpectationQuery.prototype.then = function (handler) {
    this._expectation.then = handler;
};

function createExpectationMethod(object, name, mode, options) {
    return function () {
        var expectationGroups = object.__expectations__;
        var expectations = expectationGroups[name] ||
            (expectationGroups[name] = []);

        var expectation = {
            mode: mode,
            hit: 0,
            repeat: options.repeat || {
                from: 1,
                to: 1
            },
            args: slice(arguments)
        };

        expectations.push(expectation);

        return mode === 'mock' ? new ExpectationQuery(expectation) : undefined;
    };
}

function createVerificationMethod(object, name, options) {
    return function () {
        var invocationsMap = object.__invocations__;
        var invocations = invocationsMap[name] || (invocationsMap[name] = []);

        var argConstraints = slice(arguments);

        var hit = invocations
            .filter(function (invocation) {
                return compareArguments(invocation.args, argConstraints);
            })
            .length;

        validateRepetition(name, {
            hit: hit,
            repeat: options.repeat,
            args: argConstraints
        });
    };
}

function matchExpectation(expectations, args) {
    if (!expectations) {
        return undefined;
    }

    var matchedExpectation;

    for (var i = 0; i < expectations.length; i++) {
        var expectation = expectations[i];

        if (testExpectation(expectation, args)) {
            matchedExpectation = expectation;
            break;
        }
    }

    return matchedExpectation;
}

function testExpectation(expectation, args) {
    if (
        expectation.mode === 'mock' &&
        expectation.hit >= (expectation.repeat ? expectation.repeat.to : 1)
    ) {
        return undefined;
    }

    return compareArguments(args, expectation.args);
}

function compareArguments(args, constraints) {
    if (constraints.length !== args.length) {
        return false;
    }

    return constraints.every(function (constraint, index) {
        return testValueConstraint(constraint, args[index]);
    });
}

function testValueConstraint(constraint, value) {
    if (constraint && typeof constraint === 'function') {
        switch (typeof value) {
            case 'function':
            case 'object':
                if (value instanceof constraint) {
                    return true;
                }
                break;
            default:
                if (value.constructor === constraint) {
                    return true;
                }
        }

        var isType = constraint['is' + constraint.name];

        if (isType) {
            return isType.call(constraint, value);
        }
    }

    return constraint === value;
}

function validateRepetition(name, expectation) {
    var hit = expectation.hit;
    var repeat = expectation.repeat || {
        from: 1,
        to: 1
    };

    if (hit < repeat.from || hit > repeat.to) {
        var message = 'Expecting method "' + name + '" to be called with ';

        var args = expectation.args;

        if (args.length) {
            message += 'arguments (' + args
                .map(function (arg) {
                    switch (typeof arg) {
                        case 'undefined':
                            return 'undefined';
                        case 'object':
                            if (arg !== null) {
                                return 'Object';
                            }
                        // fall through
                        case 'string':
                        case 'number':
                        case 'boolean':
                            return JSON.stringify(arg);
                    }

                    return typeof arg === 'function' && /^[A-Z]/.test(arg.name) ?
                        arg.name : arg.toString();
                })
                .join(', ') + ')';
        } else {
            message += 'no argument';
        }

        var from = repeat.from;
        var to = repeat.to;

        var rangeStr;

        if (from === to) {
            rangeStr = from.toString();
        } else if (to === Infinity) {
            rangeStr = 'at least ' + from.toString();
        } else {
            rangeStr = from + ' to ' + to;
        }

        if (hit) {
            message += ' for ' + rangeStr + ' time(s) instead of ' + hit + ' time(s)';
        } else {
            message += ' for ' + rangeStr + ' time(s)';
        }

        throw new Error(message);
    }
}

///////////
// Types //
///////////

function Any() {
    return Any;
}

Any.isAny = function () {
    return true;
};

exports.any = Any;

/////////////
// OPTIONS //
/////////////

function times(from, to, options) {
    if (typeof to !== 'number') {
        options = to;
        to = from;
    }

    options = options || {};

    var repeat = options.repeat;

    if (repeat) {
        repeat.from = Math.max(typeof repeat.from === 'number' ? repeat.from : -Infinity, from);
        repeat.to = Math.min(typeof repeat.to === 'number' ? repeat.to : Infinity, to);
    } else {
        options.repeat = {
            from: from,
            to: to
        };
    }
    return options;
}

exports.times = times;

exports.never = times.bind(undefined, 0);
exports.once = times.bind(undefined, 1);
exports.twice = times.bind(undefined, 2);

exports.atLeast = function (repeat, options) {
    return times(repeat, Infinity, options);
};

exports.atMost = function (repeat, options) {
    return times(0, repeat, options);
};
