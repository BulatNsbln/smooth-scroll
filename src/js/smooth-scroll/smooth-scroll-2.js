const defaults = {

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

export class SmoothScroll {
  smoothScroll = {};
  settings;
  anchor;
  toggle;
  fixedHeader;
  eventTimeout;
  animationInterval;
  selector;
  options;

  constructor(selector, options) {
    this.selector = selector;
    this.options = options;
  }

  _emitEvent(type, options, anchor, toggle) {
    if (!options.emitEvents || typeof window.CustomEvent !== 'function') return;
    const event = new CustomEvent(type, {
      bubbles: true,
      detail: {
        anchor: anchor,
        toggle: toggle
      }
    });
    document.dispatchEvent(event);
  };

  _supports() {
    return (
      'querySelector' in document &&
      'addEventListener' in window &&
      'requestAnimationFrame' in window &&
      'closest' in window.Element.prototype
    );
  };

  _reduceMotion() {
    return ('matchMedia' in window && window.matchMedia('(prefers-reduced-motion)').matches);
  };

  _getHeight(elem) {
    return parseInt(window.getComputedStyle(elem).height, 10);
  };

  _escapeCharacters(id) {

    // Remove leading hash
    if (id.charAt(0) === '#') {
      id = id.substr(1);
    }

    var string = String(id);
    var length = string.length;
    var index = -1;
    var codeUnit;
    var result = '';
    var firstCodeUnit = string.charCodeAt(0);
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

  _easingPattern({ easing, customEasing }, time) {
    let pattern;

    if (!!customEasing) {
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

  _getDocumentHeight() {
    return Math.max(
      document.body.scrollHeight, document.documentElement.scrollHeight,
      document.body.offsetHeight, document.documentElement.offsetHeight,
      document.body.clientHeight, document.documentElement.clientHeight
    );
  }

  _getEndLocation(anchor, headerHeight, offset, clip) {
    let location = 0;
    if (anchor.offsetParent) {
      do {
        location += anchor.offsetTop;
        anchor = anchor.offsetParent;
      } while (anchor);
    }
    location = Math.max(location - headerHeight - offset, 0);
    if (clip) {
      location = Math.min(location, this._getDocumentHeight() - window.innerHeight);
    }
    return location;
  };

  _getHeaderHeight(header) {
    return !header ? 0 : ((this._getHeight(header) + header.offsetTop)_;
  };

  _getSpeed(distance, settings) {
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

  _setHistory(options) {

    // Make sure this should run
    if (!history.replaceState || !options.updateURL || history.state) return;

    // Get the hash to use
    var hash = window.location.hash;
    hash = hash ? hash : '';

    // Set a default history
    history.replaceState(
      {
        smoothScroll: JSON.stringify(options),
        anchor: hash ? hash : window.pageYOffset
      },
      document.title,
      hash ? hash : window.location.href
    );

  };

  _updateURL(anchor, isNum, options) {
    // Bail if the anchor is a number
    if (isNum) return;

    // Verify that pushState is supported and the updateURL option is enabled
    if (!history.pushState || !options.updateURL) return;

    // Update URL
    history.pushState(
      {
        smoothScroll: JSON.stringify(options),
        anchor: anchor.id
      },
      document.title,
      anchor === document.documentElement ? '#top' : '#' + anchor.id
    );

  };

  _adjustFocus(anchor, endLocation, isNum) {

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

  animateScroll() {
    // Cancel any in progress scrolls
    this.cancelScroll();

    // Local settings
    var _settings = extend(settings || defaults, options || {}); // Merge user options with defaults

    // Selectors and variables
    var isNum = Object.prototype.toString.call(anchor) === '[object Number]' ? true : false;
    var anchorElem = isNum || !anchor.tagName ? null : anchor;
    if (!isNum && !anchorElem) return;
    var startLocation = window.pageYOffset; // Current location on the page
    if (_settings.header && !fixedHeader) {
      // Get the fixed header if not already set
      fixedHeader = document.querySelector(_settings.header);
    }
    var headerHeight = getHeaderHeight(fixedHeader);
    var endLocation = isNum ? anchor : getEndLocation(anchorElem, headerHeight, parseInt((typeof _settings.offset === 'function' ? _settings.offset(anchor, toggle) : _settings.offset), 10), _settings.clip); // Location to scroll to
    var distance = endLocation - startLocation; // distance to travel
    var documentHeight = getDocumentHeight();
    var timeLapsed = 0;
    var speed = getSpeed(distance, _settings);
    var start, percentage, position;

    /**
     * Stop the scroll animation when it reaches its target (or the bottom/top of page)
     * @param {Number} position Current position on the page
     * @param {Number} endLocation Scroll to location
     * @param {Number} animationInterval How much to scroll on this loop
     */
    var stopAnimateScroll = function (position, endLocation) {

      // Get the current location
      var currentLocation = window.pageYOffset;

      // Check if the end location has been reached yet (or we've hit the end of the document)
      if (position == endLocation || currentLocation == endLocation || ((startLocation < endLocation && window.innerHeight + currentLocation) >= documentHeight)) {

        // Clear the animation timer
        smoothScroll.cancelScroll(true);

        // Bring the anchored element into focus
        adjustFocus(anchor, endLocation, isNum);

        // Emit a custom event
        emitEvent('scrollStop', _settings, anchor, toggle);

        // Reset start
        start = null;
        animationInterval = null;

        return true;

      }
    };

    /**
     * Loop scrolling animation
     */
    var loopAnimateScroll = function (timestamp) {
      if (!start) { start = timestamp; }
      timeLapsed += timestamp - start;
      percentage = speed === 0 ? 0 : (timeLapsed / speed);
      percentage = (percentage > 1) ? 1 : percentage;
      position = startLocation + (distance * easingPattern(_settings, percentage));
      window.scrollTo(0, Math.floor(position));
      if (!stopAnimateScroll(position, endLocation)) {
        animationInterval = window.requestAnimationFrame(loopAnimateScroll);
        start = timestamp;
      }
    };

    /**
     * Reset position to fix weird iOS bug
     * @link https://github.com/cferdinandi/smooth-scroll/issues/45
     */
    if (window.pageYOffset === 0) {
      window.scrollTo(0, 0);
    }

    // Update the URL
    updateURL(anchor, isNum, _settings);

    // If the user prefers reduced motion, jump to location
    if (reduceMotion()) {
      adjustFocus(anchor, Math.floor(endLocation), false);
      return;
    }

    // Emit a custom event
    emitEvent('scrollStart', _settings, anchor, toggle);

    // Start scrolling animation
    smoothScroll.cancelScroll(true);
    window.requestAnimationFrame(loopAnimateScroll);

  }

  cancelScroll(noEvent) {
    cancelAnimationFrame(this.animationInterval);
    this.animationInterval = null;
    if (noEvent) return;
    this._emitEvent('scrollCancel', this.settings);
  }
  
  _clickHandler(event) {

    // Don't run if event was canceled but still bubbled up
    // By @mgreter - https://github.com/cferdinandi/smooth-scroll/pull/462/
    if (event.defaultPrevented) return;

    // Don't run if right-click or command/control + click or shift + click
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;

    // Check if event.target has closest() method
    // By @totegi - https://github.com/cferdinandi/smooth-scroll/pull/401/
    if (!('closest' in event.target)) return;

    // Check if a smooth scroll link was clicked
    toggle = event.target.closest(selector);
    if (!toggle || toggle.tagName.toLowerCase() !== 'a' || event.target.closest(settings.ignore)) return;

    // Only run if link is an anchor and points to the current page
    if (toggle.hostname !== window.location.hostname || toggle.pathname !== window.location.pathname || !/#/.test(toggle.href)) return;

    // Get an escaped version of the hash
    var hash;
    try {
      hash = escapeCharacters(decodeURIComponent(toggle.hash));
    } catch(e) {
      hash = escapeCharacters(toggle.hash);
    }

    // Get the anchored element
    var anchor;
    if (hash === '#') {
      if (!settings.topOnEmptyHash) return;
      anchor = document.documentElement;
    } else {
      anchor = document.querySelector(hash);
    }
    anchor = !anchor && hash === '#top' ? document.documentElement : anchor;

    // If anchored element exists, scroll to it
    if (!anchor) return;
    event.preventDefault();
    setHistory(settings);
    smoothScroll.animateScroll(anchor, toggle);

  };

  _popstateHandler(event) {

    // Stop if history.state doesn't exist (ex. if clicking on a broken anchor link).
    // fixes `Cannot read property 'smoothScroll' of null` error getting thrown.
    if (history.state === null) return;

    // Only run if state is a popstate record for this instantiation
    if (!history.state.smoothScroll || history.state.smoothScroll !== JSON.stringify(settings)) return;

    // Only run if state includes an anchor

    // if (!history.state.anchor && history.state.anchor !== 0) return;

    // Get the anchor
    var anchor = history.state.anchor;
    if (typeof anchor === 'string' && anchor) {
      anchor = document.querySelector(escapeCharacters(history.state.anchor));
      if (!anchor) return;
    }

    // Animate scroll to anchor link
    smoothScroll.animateScroll(anchor, null, {updateURL: false});

  };

  destroy() {
    // If plugin isn't already initialized, stop
    if (!this.settings) return;

    // Remove event listeners
    document.removeEventListener('click', this._clickHandler, false);
    window.removeEventListener('popstate', this._popstateHandler, false);

    // Cancel any scrolls-in-progress
    this.cancelScroll();

    // Reset variables
    this.settings = null;
    this.anchor = null;
    this.toggle = null;
    this.fixedHeader = null;
    this.eventTimeout = null;
    this.animationInterval = null;
  }
}
