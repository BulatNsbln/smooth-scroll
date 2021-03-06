import './_closest.polyfill';
import './_customEvent.polyfill';
import './_requestAnimationFrame.polyfill';

(function (root, factory) {
  if (typeof (define === 'function') && define.amd) {
    define([], function () {
      return factory(root);
    });
  } else if (typeof exports === 'object') {
    module.exports = factory(root);
  } else {
    root.SmoothScroll = factory(root);
  }
})((typeof global !== 'undefined') ? global : (typeof window !== 'undefined') ? window : this, function (window) {
  class SmoothScroll {
    #defaults = {
      // Selectors
      ignore: '[data-scroll-ignore]',
      header: null,
      topOnEmptyHash: true,

      // Speed & Duration
      speed: 500,
      speedAsDuration: false,
      durationMax: null,
      durationMin: null,
      clip: true,
      offset: 0,

      // Easing
      easing: 'easeInOutCubic',
      customEasing: null,

      // History
      updateURL: true,
      popstate: true,

      // Custom Events
      emitEvents: true

    };
    #settings;
    #anchor;
    #toggle;
    #fixedHeader;
    #eventTimeout;
    #animationInterval;
    #selector;
    #options;

    constructor(selector, options) {
      this.#selector = selector;
      this.#options = options;

      if (!this.#supports()) {
        throw 'Smooth Scroll: This browser does not support the required JavaScript methods and browser APIs.';
      }

      this.destroy();

      // Selectors and variables
      this.#settings = this.#extend(this.#defaults, options || {});
      this.#fixedHeader = this.#settings.header ? document.querySelector(this.#settings.header) : null;

      // When a toggle is clicked, run the click handler
      document.addEventListener('click', this.#clickHandler, false);

      // If updateURL and popState are enabled, listen for pop events
      if (this.#settings.updateURL && this.#settings.popstate) {
        window.addEventListener('popstate', this.#popstateHandler, false);
      }
    }

    animateScroll(anchor, toggle, options) {
      // Cancel any in progress scrolls
      this.cancelScroll();

      // Local settings
      const _settings = this.#extend(this.#settings || this.#defaults, options || {}); // Merge user options with defaults

      // Selectors and variables
      const isNum = (Object.prototype.toString.call(anchor) === '[object Number]');

      const anchorElem = isNum || (!anchor.tagName ? null : anchor);

      if (!isNum && !anchorElem) return;

      const startLocation = window.pageYOffset; // Current location on the page

      if (_settings.header && !this.#fixedHeader) {
        // Get the fixed header if not already set
        this.#fixedHeader = document.querySelector(_settings.header);
      }
      const headerHeight = this.#getHeaderHeight(this.#fixedHeader);

      const endLocation = isNum ? anchor : this.#getEndLocation(anchorElem, headerHeight, parseInt((typeof _settings.offset === 'function' ? _settings.offset(anchor, toggle) : _settings.offset), 10), _settings.clip); // Location to scroll to
      const distance = (endLocation - startLocation); // distance to travel
      const documentHeight = this.#getDocumentHeight();
      let timeLapsed = 0;
      const speed = this.#getSpeed(distance, _settings);
      let start, percentage, position;

      const stopAnimateScroll = (position, endLocation) => {
        const currentLocation = window.pageYOffset;

        // Check if the end location has been reached yet (or we've hit the end of the document)
        if (position === endLocation || currentLocation === endLocation || ((startLocation < endLocation && window.innerHeight + currentLocation) >= documentHeight)) {

          // Clear the animation timer
          this.cancelScroll(true);

          // Bring the anchored element into focus
          this.#adjustFocus(anchor, endLocation, isNum);

          // Emit a custom event
          this.#emitEvent('scrollStop', _settings, anchor, toggle);

          // Reset start
          start = null;
          this.#animationInterval = null;

          return true;
        }
      };

      const loopAnimateScroll = (timestamp) => {
        if (!start) {
          start = timestamp;
        }

        timeLapsed += timestamp - start;
        percentage = speed === 0 ? 0 : (timeLapsed / speed);
        percentage = (percentage > 1) ? 1 : percentage;
        position = startLocation + (distance * this.#easingPattern(_settings, percentage));
        window.scrollTo(0, Math.floor(position));

        if (!stopAnimateScroll(position, endLocation)) {
          this.#animationInterval = window.requestAnimationFrame(loopAnimateScroll);
          start = timestamp;
        }
      };

      if (window.pageYOffset === 0) {
        window.scrollTo(0, 0);
      }

      this.#updateURL(anchor, isNum, _settings);

      // If the user prefers reduced motion, jump to location
      if (this.#reduceMotion()) {
        this.#adjustFocus(anchor, Math.floor(endLocation), false);
        return;
      }

      this.#emitEvent('scrollStart', _settings, anchor, toggle);

      // Start scrolling animation
      this.cancelScroll(true);
      window.requestAnimationFrame(loopAnimateScroll);
    }

    cancelScroll(noEvent) {
      cancelAnimationFrame(this.#animationInterval);
      this.#animationInterval = null;

      if (!noEvent) {
        this.#emitEvent('scrollCancel', this.#settings);
      }
    }

    destroy() {
      // If plugin isn't already initialized, stop
      if (!this.#settings) return;

      // Remove event listeners
      document.removeEventListener('click', this.#clickHandler, false);
      window.removeEventListener('popstate', this.#popstateHandler, false);

      // Cancel any scrolls-in-progress
      this.cancelScroll();

      // Reset variables
      this.#settings = null;
      this.#anchor = null;
      this.#toggle = null;
      this.#fixedHeader = null;
      this.#eventTimeout = null;
      this.#animationInterval = null;
    }

    #emitEvent(type, { emitEvents }, anchor, toggle) {
      if (!emitEvents || typeof window.CustomEvent !== 'function') {
        return;
      }

      const event = new CustomEvent(type, {
        bubbles: true,
        detail: {
          anchor: anchor,
          toggle: toggle
        }
      });
      document.dispatchEvent(event);
    };

    #supports() {
      return (
        'querySelector' in document &&
        'addEventListener' in window &&
        'requestAnimationFrame' in window &&
        'closest' in window.Element.prototype
      );
    };

    #reduceMotion() {
      return ('matchMedia' in window && window.matchMedia('(prefers-reduced-motion)').matches);
    };

    #getHeight(elem) {
      return parseInt(window.getComputedStyle(elem).height, 10);
    };

    #escapeCharacters(id) {
      let newId = id;
      // Remove leading hash
      if (newId.charAt(0) === '#') {
        newId = newId.substr(1);
      }

      const string = String(newId);
      const length = string.length;
      let index = -1;
      let codeUnit;
      let result = '';
      const firstCodeUnit = string.charCodeAt(0);

      while (++index < length) {
        codeUnit = string.charCodeAt(index);
        // Note: there’s no need to special-case astral symbols, surrogate
        // pairs, or lone surrogates.

        // If the character is NULL (U+0000), then throw an
        // `InvalidCharacterError` exception and terminate these steps.
        if (codeUnit === 0x0000) {
          throw new InvalidCharacterError(
            'Invalid character: the input contains U+0000.'
          );
        }

        if (
          // If the character is in the range [\1-\1F] (U+0001 to U+001F) or is
          // U+007F, […]
          (codeUnit >= 0x0001 && codeUnit <= 0x001F) || codeUnit == 0x007F ||
          // If the character is the first character and is in the range [0-9]
          // (U+0030 to U+0039), […]
          (index === 0 && codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
          // If the character is the second character and is in the range [0-9]
          // (U+0030 to U+0039) and the first character is a `-` (U+002D), […]
          (
            index === 1 &&
            codeUnit >= 0x0030 && codeUnit <= 0x0039 &&
            firstCodeUnit === 0x002D
          )
        ) {
          // http://dev.w3.org/csswg/cssom/#escape-a-character-as-code-point
          result += '\\' + codeUnit.toString(16) + ' ';
          continue;
        }

        // If the character is not handled by one of the above rules and is
        // greater than or equal to U+0080, is `-` (U+002D) or `_` (U+005F), or
        // is in one of the ranges [0-9] (U+0030 to U+0039), [A-Z] (U+0041 to
        // U+005A), or [a-z] (U+0061 to U+007A), […]
        if (
          codeUnit >= 0x0080 ||
          codeUnit === 0x002D ||
          codeUnit === 0x005F ||
          codeUnit >= 0x0030 && codeUnit <= 0x0039 ||
          codeUnit >= 0x0041 && codeUnit <= 0x005A ||
          codeUnit >= 0x0061 && codeUnit <= 0x007A
        ) {
          // the character itself
          result += string.charAt(index);
          continue;
        }

        // Otherwise, the escaped character.
        // http://dev.w3.org/csswg/cssom/#escape-a-character
        result += '\\' + string.charAt(index);

      }

      // Return sanitized hash
      return '#' + result;

    };

    #easingPattern({ easing, customEasing }, time) {
      let pattern;

      if (customEasing) {
        pattern = customEasing(time);
      } else {
        switch (easing) {
          case 'easeInQuad':
            pattern = time * time;
            break;
          case 'easeOutQuad':
            pattern = time * (2 - time);
            break;
          case 'easeInOutQuad':
            pattern = time < 0.5 ? 2 * time * time : -1 + (4 - 2 * time) * time;
            break;
          case 'easeInCubic':
            pattern = time * time * time;
            break;
          case 'easeOutCubic':
            pattern = (--time) * time * time + 1;
            break;
          case 'easeInOutCubic':
            pattern = time < 0.5 ? 4 * time * time * time : (time - 1) * (2 * time - 2) * (2 * time - 2) + 1;
            break;
          case 'easeInQuart':
            pattern = time * time * time * time;
            break;
          case 'easeOutQuart':
            pattern = 1 - (--time) * time * time * time;
            break;
          case 'easeInOutQuart':
            pattern = time < 0.5 ? 8 * time * time * time * time : 1 - 8 * (--time) * time * time * time;
            break;
          case 'easeInQuint':
            pattern = time * time * time * time * time;
            break;
          case 'easeOutQuint':
            pattern = 1 + (--time) * time * time * time * time;
            break;
          case 'easeInOutQuint':
            pattern = time < 0.5 ? 16 * time * time * time * time * time : 1 + 16 * (--time) * time * time * time * time;
            break;
          default:
            pattern = time;
        }
      }

      return pattern;
    };

    #getDocumentHeight() {
      return Math.max(
        document.body.scrollHeight, document.documentElement.scrollHeight,
        document.body.offsetHeight, document.documentElement.offsetHeight,
        document.body.clientHeight, document.documentElement.clientHeight
      );
    }

    #getEndLocation(anchor, headerHeight, offset, clip) {
      let location = 0;
      if (anchor.offsetParent) {
        do {
          location += anchor.offsetTop;
          anchor = anchor.offsetParent;
        } while (anchor);
      }
      location = Math.max(location - headerHeight - offset, 0);
      if (clip) {
        location = Math.min(location, this.#getDocumentHeight() - window.innerHeight);
      }
      return location;
    };

    #getHeaderHeight(header) {
      return !header ? 0 : (this.#getHeight(header) + header.offsetTop);
    };

    #getSpeed(distance, settings) {
      const {
        speedAsDuration,
        speed,
        durationMax,
        durationMin,
      } = settings;

      const newSpeed = speedAsDuration ? speed : Math.abs(distance / 1000 * speed);

      if (durationMax && newSpeed > durationMax) {
        return durationMax;
      } else if (durationMin && newSpeed < durationMin) {
        return durationMin;
      } else {
        return parseInt(newSpeed, 10);
      }
    };

    #setHistory(options) {

      // Make sure this should run
      if (!history.replaceState || !options.updateURL || history.state) return;

      // Get the hash to use
      const hash = window.location.hash || '';

      // Set a default history
      history.replaceState(
        {
          smoothScroll: JSON.stringify(options),
          anchor: hash,
        },
        document.title,
        hash,
      );

    };

    #updateURL(anchor, isNum, options) {
      // Bail if the anchor is a number
      if (isNum) return;

      // Verify that pushState is supported and the updateURL option is enabled
      if (!history.pushState || !options.updateURL) return;

      const url = (anchor === document.documentElement) ? '#top' : ('#' + anchor.id);
      // Update URL
      history.pushState(
        {
          smoothScroll: JSON.stringify(options),
          anchor: anchor.id
        },
        document.title,
        url,
      );

    };

    #adjustFocus(anchor, endLocation, isNum) {
      // Is scrolling to top of page, blur
      if (anchor === 0) {
        document.body.focus();
      }

      // Don't run if scrolling to a number on the page
      if (isNum) return;

      // Otherwise, bring anchor element into focus
      anchor.focus();
      if (document.activeElement !== anchor) {
        anchor.setAttribute('tabindex', '-1');
        anchor.focus();
        anchor.style.outline = 'none';
      }
      window.scrollTo(0 , endLocation);
    };

    #extend() {
      let merged = {};

      Array.prototype.forEach.call(arguments, (obj) => {
        merged = {
          ...merged,
          ...obj,
        };
      });

      return merged;
    };

    #clickHandler(event) {
      // Don't run if event was canceled but still bubbled up
      // By @mgreter - https://github.com/cferdinandi/smooth-scroll/pull/462/
      if (event.defaultPrevented) return;

      // Don't run if right-click or command/control + click or shift + click
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;

      // Check if event.target has closest() method
      // By @totegi - https://github.com/cferdinandi/smooth-scroll/pull/401/
      if (!('closest' in event.target)) return;

      // Check if a smooth scroll link was clicked
      const toggle = event.target.closest(this.#selector);
      if (!toggle || (toggle.tagName.toLowerCase() !== 'a') || event.target.closest(this.#settings.ignore)) return;

      // Only run if link is an anchor and points to the current page
      if (toggle.hostname !== window.location.hostname || toggle.pathname !== window.location.pathname || !/#/.test(toggle.href)) return;

      // Get an escaped version of the hash
      let hash;
      try {
        hash = this.#escapeCharacters(decodeURIComponent(toggle.hash));
      } catch(e) {
        hash = this.#escapeCharacters(toggle.hash);
      }

      // Get the anchored element
      let anchor;
      if (hash === '#') {
        if (!this.#settings.topOnEmptyHash) return;
        anchor = document.documentElement;
      } else {
        anchor = document.querySelector(hash);
      }
      anchor = (!anchor && (hash === '#top')) ? document.documentElement : anchor;

      // If anchored element exists, scroll to it
      if (!anchor) return;
      event.preventDefault();
      this.#setHistory(this.#settings);
      this.animateScroll(anchor, toggle);

    };

    #popstateHandler() {

      // Stop if history.state doesn't exist (ex. if clicking on a broken anchor link).
      // fixes `Cannot read property 'smoothScroll' of null` error getting thrown.
      if (history.state === null) return;

      // Only run if state is a popstate record for this instantiation
      if (!history.state.smoothScroll || history.state.smoothScroll !== JSON.stringify(this.#settings)) return;

      // Only run if state includes an anchor

      // if (!history.state.anchor && history.state.anchor !== 0) return;

      // Get the anchor
      let anchor = history.state.anchor;
      if (typeof anchor === 'string' && anchor) {
        anchor = document.querySelector(this.#escapeCharacters(history.state.anchor));
        if (!anchor) return;
      }

      // Animate scroll to anchor link
      this.animateScroll(anchor, null, { updateURL: false });
    };
  }

  return SmoothScroll;
});
