'use strict'
/* global describe it */
const expect = require('chai').expect
const sinon = require('sinon')
const intercept = require('intercept-stdout')
const commands = require('..')

describe('skeletons', function () {
  it('can show up in JSON', function () {
    const argv = {
      _: [ 'test' ],
      jskeleton: true
    }
    let output = ''

    const unhook_intercept = intercept(function (txt) {
      output += txt
      return '' // suppress output
    })
    sinon.stub(process, 'exit')
    commands.preProcess(argv, 'test')
    unhook_intercept()
    output = JSON.stringify(JSON.parse(output)) // Normalize, removing formatting.
    expect(output).to.equal('{"message":"Multi-line message.","link":"http://example.com/alink","privacy":{"value":["EVERYONE","ALL_FRIENDS"]}}')
    sinon.restore()
  })
})
