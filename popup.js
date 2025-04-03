/* Copyright 2012 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

(function () {
  'use strict';

  // Get references to a bunch of elements, used throughout.
  var tag_field = document.getElementById('tag');
  var key_field = document.getElementById('key');
  var hash_field = document.getElementById('hash');
  var bump_button = document.getElementById('bump');
  var fill_button = document.getElementById('fill');
  var options_button = document.getElementById('showoptions');
  var options_div = document.getElementById('options');

  // Fetch the stored master password and fill the key field if it exists.
  chrome.storage.local.get('masterpassword', function (items) {
    if ('masterpassword' in items) {
      key_field.value = items.masterpassword;
    }
  });

  // Fetch the options, then execute the following code as a callback.
  getOptions(function (options) {

    // Given the URL of the document, return the guessed site tag.
    var guessTag = function (url) {
      var anchor = document.createElement('a');
      anchor.href = url;
      if (options.guesstag == 'full')
        return anchor.host;
      var parts = splitPublicSuffix(anchor.host);
      var prefix = parts[0];
      var suffix = parts[1];
      if (prefix.length >= 1) {
        if (options.guesstag == 'name')
          return prefix[prefix.length - 1];
        else if (options.guesstag == 'domain')
          return prefix[prefix.length - 1] + '.' + suffix.join('.');
      } else if (suffix.length >= 1) {
        if (options.guesstag == 'name')
          return suffix[0];
        else if (options.guesstag == 'domain')
          return suffix.join('.')
      }
    };

    // Ask chrome for a reference to the current tab, and call f with the tab
    // as an argument. Async.
    var withCurrentTab = function (f) {
      chrome.tabs.query(
          {windowId: chrome.windows.WINDOW_ID_CURRENT, active: true},
          function (tabs) {
        if (tabs.length >= 1)
          f.call(null, tabs[0]);
      });
    };

    // replace the value of all password inputs with the generated hash
    var setPasswordInputs = function (quoted) {
      var inputs = document.getElementsByTagName('input');
      for (var i = 0; i < inputs.length; ++i)
        if (inputs[i].getAttribute('type') == 'password')
          inputs[i].value = quoted;
    }

    // Given a chrome tab object, inject a content script which sets the value
    // of every password field in that tab to the currently calculated hash
    // output. Save the master password if it's supposed to be stored, save
    // tag-specific options, and then close the popup.
    var fillHash = function (tab) {
      var quoted = hash_field.value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      chrome.scripting.executeScript({
        target: {tabId: tab.id},
        func: setPasswordInputs,
        args: [quoted],
      });

      if (options.storepass == 'forever') {
        chrome.storage.local.set({masterpassword: key_field.value});
      }
      if (options.storesite != 'never') {
        options.saveTagSpecific(options.storesite == 'changed');
      }

      window.close();
    };

    // Fill the hash in the current tab.
    var fillCurrentTab = function () {
      withCurrentTab(fillHash);
    };

    // Handle keypresses in the popup: enter should fill the hash into the
    // current tab if both the tag and key are specified, otherwise move the
    // focus to the empty field.
    var checkKeyPress = function (event) {
      if (event.which == 13) {
        event.preventDefault();
        if (tag_field.value == '')
          tag_field.focus();
        else if (key_field.value == '')
          key_field.focus();
        else
          fillCurrentTab();
      }
    };

    // Define a function that uses the field values and the current options to
    // recalculate the hash.
    var recalculateHash = function () {
      if (tag_field.value && key_field.value) {
        hash_field.value = PassHashCommon.generateHashWord(
          tag_field.value,
          key_field.value,
          options.length,
          options.digits,
          options.punctuation,
          options.mixedcase,
          options.nospecial,
          options.digitsonly);
      } else {
        hash_field.value = '';
      }
    };

    var tagSplit = /^(.*)(?::([0-9]+))$/;

    // When the tag has changed, load the tag-specific options again and
    // recalculate the hash in case the key is already provided. If it's
    // a guessed tag, append the stored bump value.
    var tagChanged = function (guessed) {
      var match = tagSplit.exec(tag_field.value);
      if (match && match.length == 3) {
        options.loadTag(match[1], parseInt(match[2], 10));
      } else {
        var bump = options.loadTag(tag_field.value);
        if (guessed === true && bump !== undefined) {
          tag_field.value = tag_field.value + ':' + bump;
          tagChanged();
          return;
        }
      }
      recalculateHash();
    };

    // Bump the site tag to the next highest number.
    var bumpTag = function () {
      if (tag_field.value.length == 0)
        return;

      var match = tagSplit.exec(tag_field.value);
      if (match && match.length == 3) {
        tag_field.value = match[1] + ':' + (parseInt(match[2], 10) + 1);
      } else {
        tag_field.value = tag_field.value + ':1';
      }

      tagChanged();
    }


    /////////////////////////////////////////////////
    // Execution starts here.

    // The hash and tag fields have type "password" for confidentiality by
    // default. If the user has asked to display them, change their type back to
    // "text".
    if (options.displayhash)
      hash_field.setAttribute('type', 'text');
    if (options.displaytag)
      tag_field.setAttribute('type', 'text');

    // Set up the per-site options controls to match the default options,
    // and arrange for recalculateHash to be called if the options change.
    options.bindToDOM(recalculateHash);

    // Set event handlers on fields. Recalculate the hash when inputs change,
    // also check for enter and handle button clicks.
    tag_field.addEventListener('input', tagChanged);
    tag_field.addEventListener('keypress', checkKeyPress);
    key_field.addEventListener('input', recalculateHash);
    key_field.addEventListener('keypress', checkKeyPress);
    hash_field.addEventListener('keypress', checkKeyPress);
    bump_button.addEventListener('click', bumpTag);
    fill_button.addEventListener('click', fillCurrentTab);
    options_button.addEventListener('click', function () {
      if (options_div.style.display == 'block') {
        options_div.style.display = 'none';
      } else {
        options_div.style.display = 'block';
      }
    });

    // Initially, focus the tag field. We don't know if we can guess it yet.
    tag_field.focus();

    if (options.guesstag != 'no') {
      withCurrentTab(function (tab) {
          tag_field.value = guessTag(tab.url);
          // Load tag-specific options after tag guessing. This will also
          // calculate the hash if the key was saved (in which case we may be
          // done already).
          tagChanged(true);
          // Focus the key field after tag guessing, in the assumption that the
          // guess was correct.
          key_field.focus();
      });
    }
  });
})();
