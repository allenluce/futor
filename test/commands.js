'use strict'
/* global describe before beforeEach after afterEach it */
const expect = require('chai').expect
const sinon = require('sinon')
const FB = require('fb')
const commands = require('..')
const intercept = require('intercept-stdout')
const YAML = require('js-yaml')

const fixtureData = {
  me: {
    'id': '10209681603216006',
    'age_range': {
      'min': 21
    },
    'context': {
      'mutual_friends': {
        'data': [],
        'summary': {
          'total_count': 34
        }
      },
      'mutual_likes': {
        'data': [],
        'summary': {
          'total_count': 2
        }
      },
      'id': 'dXNlcl9jb250ZAXh0OgGQ86LfT76ZAPwyq0XmikMd7UXqyvyRYZB0jt7ivjHaQrJZAOkuZB7qwImfHcEOL5xQooZBHiVUION7iTm6VRZA9f1ZBYqZCwG5h6IzmP0Xtxq7hTMPgZAcZD'
    },
    'currency': {
      'currency_offset': 100,
      'usd_exchange': 1,
      'usd_exchange_inverse': 1,
      'user_currency': 'USD'
    },
    'first_name': 'Allen',
    'gender': 'male',
    'install_type': 'UNKNOWN',
    'installed': true,
    'is_shared_login': false,
    'is_verified': false,
    'last_name': 'Luce',
    'link': 'https://www.facebook.com/app_scoped_user_id/10209681603216006/',
    'locale': 'en_US',
    'name': 'Allen Luce',
    'name_format': '{first} {last}',
    'payment_pricepoints': {
      'mobile': [
        {
          'credits': 10,
          'local_currency': 'USD',
          'user_price': '1.0000'
        },
        {
          'credits': 20,
          'local_currency': 'USD',
          'user_price': '1.9900'
        }
      ]
    },
    'security_settings': {
      'secure_browsing': {
        'enabled': true
      }
    },
    'test_group': 5,
    'third_party_id': 'oPqXF_5a5L-XN1gz8rSh2rmrCFM',
    'timezone': -7,
    'updated_time': '2016-05-26T00:59:22+0000',
    'verified': true,
    'video_upload_limits': {
      'length': 7200,
      'size': 4294967296
    },
    'viewer_can_send_gift': false
  }
}

describe('Commands', function () {
  before(function () {
    sinon.stub(commands, 'setAccessToken')
    sinon.stub(process, 'exit')
    // A mock of the FB object, it returns a filtered set of fixed fields.
    sinon.stub(FB.api, 'apply').callsFake(function (args) {
      const output = {}
      const callName = args[0]
      const opts = args[1]
      const cb = args[2]
      for (let fieldSet of opts.fields) {
        for (let field of fieldSet.split(',')) {
          if (typeof fixtureData[callName][field] !== 'undefined') {
            output[field] = fixtureData[callName][field]
          }
        }
      }
      cb(output)
    })
  })

  after(function () {
    sinon.restore()
  })

  // Intercept stdout for each test.
  beforeEach(function () {
    this.output = ''
    this.unhook_intercept = intercept((txt) => {
      this.output += txt
      if (txt.includes("\u001b")) { // Allows reporting ANSI output
        return `${txt}`
      }
      return '' // suppress output
    })
  })

  afterEach(function () {
    this.unhook_intercept()
  })

  describe('me', function () {
    describe('with limited fields', function () {
      it('returns YAML by default', function () {
        commands.me({
          _: [ 'me' ],
          fields: [ 'name,id' ]
        })
        expect(this.output).to.equal("name: Allen Luce\nid: '10209681603216006'\n\n")
      })
      it('returns JSON when requested', function () {
        commands.me({
          _: [ 'me' ],
          fields: [ 'name,id' ],
          jsonoutput: true
        })
        expect(this.output).to.equal('{"name":"Allen Luce","id":"10209681603216006"}\n')
      })
    })

    describe('with no fields specified', function () {
      it('returns YAML by default', function () {
        commands.me({
          _: [ 'me' ]
        })
        expect(this.output).to.equal(YAML.safeDump(fixtureData.me) + '\n')
      })
      it('returns JSON when requested', function () {
        commands.me({
          _: [ 'me' ],
          jsonoutput: true
        })
        expect(this.output).to.equal(JSON.stringify(fixtureData.me) + '\n')
      })
    })
  })
})
