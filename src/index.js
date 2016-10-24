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
 * @returns {Proxy} A proxy.
 */
function mock(object) {
    if (typeof object === 'undefined') {
        object = {};
    }

    Object.defineProperties(object, {
        __expectations__: {
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
        }
    });

    return new Proxy(object, {
        get: function (target, name) {
            var expectationGroups = target.__expectations__;

            if (expectationGroups && name in expectationGroups) {
                return function () {
                    return spiedMethod.call(this, target, name, arguments);
                };
            } else {
                return target[name];
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

function spiedMethod(target, name, args) {
    var expectation = matchExpectation(
        target.__expectations__[name],
        args
    );

    if (expectation) {
        expectation.hit++;
    }

    return target[name].apply(this, args);
}

////////////
// VERIFY //
////////////

function verify(spy) {
    for (var name in spy.__expectations__) {
        var expectations = spy.__expectations__[name];

        for (var i = 0; i < expectations.length; i++) {
            var expectation = expectations[i];
            validateRepetition(name, expectation);
        }
    }
}

exports.verify = verify;

////////////
// SHARED //
////////////

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

function createExpectationMethod(target, name, mode, options) {
    return function () {
        var expectationGroups = target.__expectations__;
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

function matchExpectation(expectations, args) {
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

    var argConstraints = expectation.args;

    if (argConstraints.length !== args.length) {
        return false;
    }

    return argConstraints.every(function (constraint, index) {
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
