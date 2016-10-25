'use strict';

var assert = require('assert');
var EventEmitter = require('events');

var mock = require('../');

var any = mock.any;
var atLeast = mock.atLeast;
var atMost = mock.atMost;
var expect = mock.expect;
var never = mock.never;
var once = mock.once;
var spy = mock.spy;
var times = mock.times;
var twice = mock.twice;
var verify = mock.verify;
var when = mock.when;
var whenever = mock.whenever;

require('t');

function Foo() {
    this.foo = 'hello';
    this.say = function (something) {
        return 'say:' + something;
    };
}

Foo.prototype.bar = function (arg) {
    return this.foo + arg;
};

it('should return expected value once', function () {
    var foo = mock();
    when(foo).bar('test').return('result');
    assert.equal(foo.bar('test'), 'result');
    assert.throws(function () {
        foo.bar('test');
    }, TypeError);
});

it('should return expected value for matching argument types once', function () {
    var foo = mock();
    when(foo).bar(String).return('string');
    when(foo).bar(Number).return('number');
    when(foo).bar(Date).return('date');

    assert.equal(foo.bar(0), 'number');
    assert.equal(foo.bar('test'), 'string');
    assert.equal(foo.bar(new Date()), 'date');

    assert.throws(function () {
        foo.bar(true);
    }, TypeError);
});

it('should return expected value multiple times', function () {
    var foo = mock(new Foo());
    whenever(foo).bar('test').return('result');
    assert.equal(foo.bar('test'), 'result');
    assert.equal(foo.bar('test'), 'result');
});

it('should return expected values', function () {
    var foo = mock(new Foo());
    when(foo).bar('test').return('a');
    when(foo).bar('test').return('b');
    assert.equal(foo.bar('test'), 'a');
    assert.equal(foo.bar('test'), 'b');
});

it('should work with event emitter', function (done) {
    var foo = mock(new EventEmitter());
    when(foo).bar('test').return('a');
    assert.equal(foo.bar('test'), 'a');

    foo.on('test', done);
    foo.emit('test');
});

it('should return expected for matched type', function () {
    var foo = mock(new Foo());
    assert.equal(foo.bar('test'), 'hellotest');
    when(foo).bar(Date).return('result');
    assert.equal(foo.bar(new Date()), 'result');
});

it('should return undefined for expectation without then/return/throw', function () {
    var foo = mock(new Foo());
    when(foo).bar('test');
    assert.equal(foo.bar('test'), undefined);
});

it('should match any', function () {
    var foo = mock(new Foo());
    whenever(foo).bar(any).return('result');
    assert.equal(foo.bar('test'), 'result');
    assert.equal(foo.bar('something'), 'result');
});

it('should return expected value one by one', function () {
    var foo = mock(new Foo());
    when(foo).bar('test').return('result');
    when(foo).bar('test').return('another result');
    assert.equal(foo.bar('test'), 'result');
    assert.equal(foo.bar('test'), 'another result');
});

it('should throw exception as expected', function () {
    var foo = mock(new Foo());
    when(foo).bar('test').throw(new Error('yo'));
    assert.throws(function () {
        foo.bar('test');
    });
});

it('should return value from function', function () {
    var foo = mock(new Foo());
    when(foo).bar('test').then(function () {
        return 1;
    });
    assert.equal(foo.bar('test'), 1);
});

it('should pass arguments to function', function () {
    var foo = mock(new Foo());
    when(foo).bar(any, any).then(function (a, b) {
        assert.equal(this, foo);
        return a + b;
    });
    assert.equal('testhahaha', foo.bar('test', 'hahaha'));
});

it('should verify expected invocation of mocker', function () {
    var foo = mock(new Foo());
    when(foo).bar('test').return('result');
    assert.equal(foo.bar('test'), 'result');
    verify(foo, true);
});

it('should error verifying unexpected invocation of mocker', function () {
    var foo = mock(new Foo());
    when(foo).bar('test').return('result');
    when(foo).bar('hahaha').return('result');
    assert.equal(foo.bar('test'), 'result');

    assert.throws(function () {
        verify(foo, true);
    }, /hahaha/);
});

it('should verify expected invocation of spy', function () {
    var foo = spy({
        bar: function () {
            return 'result';
        }
    });
    expect(foo).bar('test');
    assert.equal(foo.bar('test'), 'result');
    verify(foo, true);
});

it('should error verifying unexpected invocation of spy', function () {
    var foo = spy({
        bar: function () {
            return 'result';
        }
    });
    expect(foo).bar('test');
    expect(foo).bar('hahaha');
    assert.equal(foo.bar('test'), 'result');

    assert.throws(function () {
        verify(foo, true);
    }, /hahaha/);
});

it('should verify expected invocation with `times`', function () {
    var foo = spy({
        bar: function () { }
    });

    expect(foo).bar('test');
    expect(foo, times(2)).bar('yo');

    foo.bar('test');
    foo.bar('yo');
    foo.bar('yo');

    verify(foo, true);
});

it('should error verifying unexpected invocation with `times`', function () {
    var foo = spy({
        bar: function () { }
    });

    expect(foo).bar('test');
    expect(foo, times(2)).bar('yo');

    foo.bar('test');
    foo.bar('yo');

    assert.throws(function () {
        verify(foo, true);
    }, /yo/);
});

it('should verify expected invocation with `any`', function () {
    var foo = spy({
        bar: function () { }
    });

    expect(foo).bar(any);

    foo.bar('test');

    verify(foo, true);
});

it('should error verifying unexpected invocation with `any`', function () {
    var foo = spy({
        bar: function () { }
    });

    expect(foo).bar(any);

    assert.throws(function () {
        verify(foo, true);
    }, /Any/);
});

it('should verify expected invocation with `never`', function () {
    var foo = spy({
        bar: function () { }
    });

    expect(foo, never()).bar();
    verify(foo, true);
});

it('should error verifying unexpected invocation with `never`', function () {
    var foo = spy({
        bar: function () { }
    });

    expect(foo, never()).bar();

    foo.bar();

    assert.throws(function () {
        verify(foo, true);
    }, /0 time/);
});

it('shuld verify expected invocation with `never` while other args call', function () {
    var foo = spy({
        bar: function () { },
        ha: function () { }
    });

    expect(foo, never()).bar();

    foo.bar(123);
    foo.ha();

    verify(foo, true);
});

it('should verify expected invocation with `once`', function () {
    var foo = spy({
        bar: function () { }
    });

    expect(foo, once()).bar();

    foo.bar();

    verify(foo, true);
});

it('should verify expected invocation with `twice`', function () {
    var foo = spy({
        bar: function () { }
    });

    expect(foo, twice()).bar();

    foo.bar();
    foo.bar();

    verify(foo, true);
});

it('should verify expected invocation with `atLeast`', function () {
    var foo = spy({
        bar: function () { }
    });

    expect(foo, atLeast(2)).bar();

    foo.bar();
    foo.bar();

    verify(foo, true);
});

it('should error verifying unexpected invocation with `atLeast`', function () {
    var foo = spy({
        bar: function () { }
    });

    expect(foo, atLeast(2)).bar();

    foo.bar();

    assert.throws(function () {
        verify(foo, true);
    }, /1 time/);
});

it('should verify expected invocation with `atMost`', function () {
    var foo = spy({
        bar: function () { }
    });

    expect(foo, atMost(2)).bar();

    foo.bar();
    foo.bar();

    verify(foo, true);
});

it('should error verifying unexpected invocation with `atMost`', function () {
    var foo = spy({
        bar: function () { }
    });

    expect(foo, atMost(2)).bar();

    foo.bar();
    foo.bar();
    foo.bar();

    assert.throws(function () {
        verify(foo, true);
    }, /0 to 2/);
});

it('should verify any mock', function () {
    var foo = mock({}, true);

    foo.bar('a');
    foo.bar('b');

    verify(foo, twice()).bar(String);
    verify(foo, once()).bar('a');

    assert.throws(function () {
        verify(foo).yo();
    });

    assert.throws(function () {
        verify(foo, twice()).bar('a');
    });
});
