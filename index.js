#!/usr/bin/env node
'use strict'
const expandHomeDir = require('expand-home-dir')
const yargs = require('yargs')
const fs = require('fs')
const FB = require('fb')
let openurl
try {
  openurl = require('openurl')
} catch (e) {
  openurl = false
}
const WebSocket = require('ws')
const YAML = require('js-yaml')
const path = require('path')
const validUrl = require('valid-url')
const rw = require('rw')
const inquirer = require('inquirer')
const fields = require('./fields')
const moment = require('moment')

const TOKEN_FILE = expandHomeDir('~/.futor_token')
const TOKEN_SERVER_URL = 'wss://futor.con.com/ws'

const privacyEnum = [ 'SELF', 'ALL_FRIENDS', 'FRIENDS_OF_FRIENDS', 'EVERYONE', 'CUSTOM' ]

fields.getposts = fields.getpost
fields.impressions = fields.getpost

const outData = function (argv, data) {
  if (!argv.jsonoutput) {
    data = YAML.safeDump(data)
  }
  console.log(data)
}

const callFB = function () {
  const args = (arguments.length === 1 ? [arguments[0]] : Array.apply(null, arguments))
  const argv = args.shift()

  let callafter
  if (typeof args[args.length - 1] === 'function') {
    callafter = args.pop()
  }
  args.push(function (data) {
    if (data.error) {
      console.error(data.error)
      process.exit(1)
    }
    if (callafter) {
      callafter(data)
    } else {
      outData(argv, data)
    }
    process.exit(0)
  })
  console.log(JSON.stringify(args))
  FB.api(...args)
}

class FF {
  static preProcess (argv) {
    // Output skeleton?
    if (argv.skeleton || argv.jskeleton) {
      let fileData = fs.readFileSync(path.resolve(
        path.join(__dirname, 'skeletons', argv._[0] + '.yaml'))).toString('utf-8')
      if (argv.jskeleton) { // convert YAML to JSON
        fileData = JSON.stringify(YAML.safeLoad(fileData), null, 4)
      }
      console.log(fileData)
      process.exit(0)
      return // Reachable by tests after process.exit() is stubbed.
    }
    let opts = {}
    // Parse input file, if any, first.
    if (argv.jsoninput || argv.yamlinput) {
      let filename = argv.jsoninput || argv.yamlinput
      if (typeof filename === 'boolean') {
        filename = '/dev/stdin'
      }
      const fileData = rw.readFileSync(filename).toString('utf-8')
      if (argv.yamlinput) { // YAML to JSON
        opts = YAML.safeLoad(fileData)
      } else { // JSON to JSON
        opts = JSON.parse(fileData)
      }
    }
    if (!opts.privacy) { // Not specified in file.
      opts.privacy = { value: argv.privacy }
    }
    if (!opts.publish) { // Not specified in file.
      opts.published = argv.publish
    }
    if (!opts.fields) { // Not specified in file.
      if (argv.fields) { // Given on command line?
        opts.fields = argv.fields
      } else if (fields[argv._[0]]) { // No, do defaults exist?
        opts.fields = fields[argv._[0]] // Yes, set them.
      }
    }
    FF.setAccessToken(argv)
    return opts
  }

  static setAccessToken (argv) {
    if (argv.token) {
      FB.setAccessToken(argv.token)
      return
    }
    try {
      const access_token = fs.readFileSync(argv.tokenfile).toString('utf-8')
      FB.setAccessToken(access_token)
    } catch (e) {
      if (e.code === 'ENOENT') {
        console.error(`Auth token file ${argv.tokenfile} not found. Use 'auth' command to create it.`)
        process.exit(1)
      }
      console.error(e)
    }
  }
  
  static withAccessToken (argv) {
    if (argv.token) {
      return FB.withAccessToken(argv.token)
    }
    try {
      const access_token = fs.readFileSync(argv.tokenfile).toString('utf-8')
      return FB.withAccessToken(access_token)
    } catch (e) {
      if (e.code === 'ENOENT') {
        console.error(`Auth token file ${argv.tokenfile} not found. Use 'auth' command to create it.`)
        process.exit(1)
      }
      console.error(e)
    }
  }

  static auth (argv) {
    var ws = new WebSocket(TOKEN_SERVER_URL)
    ws.on('open', function () {
      ws.send(`token ${argv.tokenfile}`)
    })
    ws.on('error', function (err) {
      console.error(`${err} contacting ${TOKEN_SERVER_URL}`)
      process.exit(1)
    })
    ws.on('message', function (data, flags) {
      const msgs = data.split(' ')
      switch (msgs[0]) {
        case 'url':
          if (openurl) {
            openurl.open(msgs[1])
          } else {
            console.log(`open ${msgs[1]} in your browser`)
            console.log('Leave futor running while you do so.')
          }
          break
        case 'token':
          const access_token = msgs[1]
          fs.writeFileSync(argv.tokenfile, access_token)
          ws.close()
          console.log(`Token saved to ${argv.tokenfile}`)
      }
    })
  }

  static getposts (argv) {
    const opts = FF.preProcess(argv)
    let page = 'me'
    if (argv.page) {
      page = argv.page
      delete opts.privacy
    }
    callFB(argv, `/${page}/posts`, opts)
  }

  static getpost (argv) {
    callFB(argv, argv.postId, FF.preProcess(argv))
  }
  
  static post (argv) {
    // Check for page token
    if (argv.aspage) { // Get page token
      const pfb = FF.withAccessToken(argv)
      pfb.api(`/${argv.page}`, {fields: ['access_token']}, function (data) {
        argv.page_token = data.access_token
        FF.do_post(argv)
      })
    } else {
      FF.do_post(argv)
    }
  }

  static do_post (argv) {
    const opts = FF.preProcess(argv)
    let page = 'me'
    if (argv.message) {
      opts.message = argv.message
    }
    if (argv.schedule) {
      let schedule
      schedule = moment(argv.schedule)
//      if (schedule.
//        schedule = moment().add(moment.duration(schedule))
//      console.log(schedule)
//      process.exit(0)
      opts.scheduled_publish_time = schedule.unix()
    }
    if (argv.countries) {
      opts.targeting = { countries: argv.countries[0] }
    }
    if (argv.link) {
      opts.link = argv.link
    }
    if (argv.page) {
      page = argv.page
      delete opts.privacy
    }
    if (argv.page_token) {
      opts.access_token = argv.page_token
    }
    
    if (argv.interactive) { // Fill opts based on questions.
      var questions = [
        {
          type: 'list',
          name: 'type',
          message: 'What page is this for?',
          choices: ['mine', 'other']
        },
        {
          type: 'input',
          name: 'page',
          message: 'Page id: '
        },
        {
          type: 'confirm',
          name: 'linkp',
          message: 'Add a link?',
          default: false
        },
        {
          type: 'input',
          name: 'link',
          message: 'Link URL:',
          when: function (answers) {
            return answers.linkp
          }
        },
        {
          type: 'confirm',
          name: 'messagep',
          message: 'add a message?',
          default: true
        },
        {
          type: 'input',
          name: 'message',
          message: 'Text of post:',
          when: function (answers) {
            return answers.messagep
          }
        }
      ]
      inquirer.prompt(questions).then(function (answers) {
        if (answers.message) {
          opts.message = answers.message
        }
        if (answers.link) {
          opts.link = answers.link
        }
        if (answers.type === 'other') {
          page = answers.page
          delete opts.privacy
        }
        callFB(argv, `/${page}/feed`, 'POST', opts)
      })
    } else {
      callFB(argv, `/${page}/feed`, 'POST', opts)
    }
  }

  static updatepost (argv) {
    const opts = FF.preProcess(argv)
    delete opts.privacy
    if (argv.publish) {
      opts.is_published = argv.publish
    }
    callFB(argv, `/${argv.postId}`, 'POST', opts)
  }

  static me (argv) {
    callFB(argv, 'me', FF.preProcess(argv))
  }

  static accounts (argv) {
    callFB(argv, '/me/accounts', FF.preProcess(argv))
  }

  static page (argv) {
    callFB(argv, `/${argv.pageId}`, FF.preProcess(argv))
  }

  static insights (argv) {
    callFB(argv, `/${argv.objectId}/insights`, FF.preProcess(argv))
  }

  static impressions (argv) {
    const opts = FF.preProcess(argv)
    let page = 'me'
    if (argv.pageId) {
      page = argv.pageId
      delete opts.privacy
    }
    callFB(argv, `/${page}/posts`, opts, function (data) {
      for (let post of data.data) {
        const unique = post.insights.data.filter((item) => {
          return item.name === 'post_impressions_unique'
        })
        console.log(`ID: ${post.id}
Message: ${post.message}
Unique impressions:  ${unique[0].values[0].value}
`)
      }
    })
  }

  static isFile (filename) {
    try {
      return fs.statSync(filename).isFile()
    } catch (e) {
      return false
    }
  }

  static postphoto (argv) {
    const opts = FF.preProcess(argv)
    const image = argv['imageFile|url']
    if (validUrl.isUri(image) && !FF.isFile(image)) {
      opts.url = image
    } else {
      opts.source = fs.createReadStream(image)
    }
    if (argv.caption) {
      opts.caption = argv.caption
    }
    callFB(argv, '/me/photos', 'post', opts)
  }
}

const noOpts = (yargs) => { return yargs }

if (!module.parent) {
  yargs
    .usage('Usage: $0 <command> [options]')
    .choices('privacy', privacyEnum)
    .option('t', {
      alias: 'tokenfile',
      default: TOKEN_FILE,
      describe: 'File for the auth token'
    })
    .option('p', {
      alias: 'privacy',
      default: privacyEnum[0],
      describe: 'Privacy level to support'
    })
    .option('j', {
      alias: 'jsonoutput',
      describe: 'Emit output as JSON'
    })
    .option('jsoninput', {
      describe: 'JSON file to use for data (or blank for stdin)'
    })
    .option('yamlinput', {
      describe: 'YAML file to use for data (or blank for stdin)'
    })
    .option('skeleton', {
      describe: 'Output YAML skeleton for command.'
    })
    .option('jskeleton', {
      describe: 'Output JSON skeleton for command.'
    })
    .option('f', {
      alias: 'fields',
      describe: 'Fields to fetch',
      type: 'array'
    })
    .option('publish', {
      describe: 'Publish this post',
      boolean: true,
      default: true
    })
    .global(['t', 'p', 'j', 'y', 'f', 'skeleton', 'jskeleton', 'publish'])
    .command('auth', 'Obtain authentication token from Facebook', noOpts, FF.auth)
    .command('me', 'Get information about yourself', noOpts, FF.me)
    .command('accounts', 'Show Facebook Pages you administer', noOpts, FF.accounts)
    .command('getposts', 'Get all posts on your wall', (yargs) => {
      return yargs
        .option('page', {
          describe: 'Page ID of post',
          default: 'me'
        })
    }, FF.getposts)
    .command('getpost <postId>', 'Get a particular post on your wall', noOpts, FF.getpost)
    .command('post [-i]', 'Create a post', (yargs) => {
      return yargs
        .option('interactive', {
          alias: 'i',
          describe: 'Post interactively'
        })
        .option('message', {
          describe: 'Message to post'
        })
        .option('link', {
          describe: 'URL of link to post'
        })
        .option('page', {
          describe: 'Page ID of post',
          default: 'me'
        })
        .option('schedule', {
          describe: 'Schedule post for later publishing.'
        })
        .option('aspage', {
          describe: 'Post as page, not yourself.'
        })
        .option('countries', {
          describe: 'Countries to restrict this post to.',
          type: 'array'
        })
      
    }, FF.post)
    .command('updatepost <postId>', 'Update a post', noOpts, FF.updatepost)
    .command('page <pageId>', 'Get info on a page', noOpts, FF.page)
    .command('insights <objectId>', 'Get Facebook Insight info on an object', noOpts, FF.insights)
    .command('impressions <pageId>', 'Get 28-day impression count on a page', noOpts, FF.impressions)
    .command('postphoto <imageFile|url>', 'Upload an image', (yargs) => {
      return yargs
        .option('caption', {
          alias: 'c',
          describe: 'Caption for image.'
        })
    }, FF.postphoto)
    .demand(1)
    .strict()
    .version()
    .help('h')
    .argv
} else {
  module.exports = FF
}
