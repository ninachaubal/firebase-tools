'use strict';

var Command = require('../lib/command');
var logger = require('../lib/logger');
var FirebaseError = require('../lib/error');
var configstore = require('../lib/configstore');
var uuid = require('uuid');
var open = require('open');
var chalk = require('chalk');
var Firebase = require('firebase');
var api = require('../lib/api');
var utils = require('../lib/utils');
var RSVP = require('rsvp');
var _ = require('lodash');

var ticketsRef = new Firebase(utils.addSubdomain(api.realtimeOrigin, 'firebase')).child('sessionTickets');

module.exports = new Command('login')
  .description('sign into Firebase')
  .action(function(options) {
    if (options.nonInteractive) {
      return utils.reject('Cannot run login in non-interactive mode. Pass ' + chalk.bold('--token') + ' instead.', {exit: 1});
    }

    return new RSVP.Promise(function(resolve, reject) {
      var user = configstore.get('user');
      var session = configstore.get('session');

      if (user && session) {
        logger.info('Already logged in as', chalk.bold(user.email));
        resolve(user);
      } else {
        var ticket = uuid.v4();
        var url = api.websiteOrigin + '/login/confirm.html?ticket=' + ticket;
        var ticketRef = ticketsRef.child(ticket);

        ticketRef.set({
          created: Firebase.ServerValue.TIMESTAMP
        }, function(err) {
          if (err) {
            reject(new FirebaseError('There was a problem logging in', {original: err}));
          }
          logger.info('Visit this URL on any device to log in:');
          logger.info(chalk.bold.underline(url));
          logger.info();
          logger.info('Waiting for authentication...');
          logger.info();

          // tickets expire after 5 min, so timeout at that point
          setTimeout(function() {
            return reject(new FirebaseError('Authentication timed out.', {
              exit: 1
            }));
          }, 300000);

          ticketRef.child('result').on('value', function(snap) {
            var auth = snap.val();
            if (snap.exists()) {
              ticketRef.update({
                result: null,
                consumed: Firebase.ServerValue.TIMESTAMP
              }, function(error) {
                if (error) {
                  reject(new FirebaseError('Unexpected error while completing authentication.', {
                    original: err,
                    exit: 2
                  }));
                }

                ticketRef.child('result').off('value');
                configstore.set('user', auth.user);
                configstore.set('session', auth.session);
                configstore.set('usage', _.get(auth, 'prefs.usage', false));
                utils.logSuccess('Success! Logged in as ' + chalk.bold(auth.user.email));
                resolve(auth);
              });
            }
          });

          open(url);
        });
      }
    });
  });
