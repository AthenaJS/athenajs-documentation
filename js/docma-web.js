/*! dustjs-linkedin - v2.7.2
* http://dustjs.com/
* Copyright (c) 2015 Aleksander Williams; Released under the MIT License */
(function (root, factory) {
  if (typeof define === 'function' && define.amd && define.amd.dust === true) {
    define('dust.core', [], factory);
  } else if (typeof exports === 'object') {
    module.exports = factory();
  } else {
    root.dust = factory();
  }
}(this, function() {
  var dust = {
        "version": "2.7.2"
      },
      NONE = 'NONE', ERROR = 'ERROR', WARN = 'WARN', INFO = 'INFO', DEBUG = 'DEBUG',
      EMPTY_FUNC = function() {};

  dust.config = {
    whitespace: false,
    amd: false,
    cjs: false,
    cache: true
  };

  // Directive aliases to minify code
  dust._aliases = {
    "write": "w",
    "end": "e",
    "map": "m",
    "render": "r",
    "reference": "f",
    "section": "s",
    "exists": "x",
    "notexists": "nx",
    "block": "b",
    "partial": "p",
    "helper": "h"
  };

  (function initLogging() {
    /*global process, console*/
    var loggingLevels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, NONE: 4 },
        consoleLog,
        log;

    if (typeof console !== 'undefined' && console.log) {
      consoleLog = console.log;
      if(typeof consoleLog === 'function') {
        log = function() {
          consoleLog.apply(console, arguments);
        };
      } else {
        log = function() {
          consoleLog(Array.prototype.slice.apply(arguments).join(' '));
        };
      }
    } else {
      log = EMPTY_FUNC;
    }

    /**
     * Filters messages based on `dust.debugLevel`.
     * This default implementation will print to the console if it exists.
     * @param {String|Error} message the message to print/throw
     * @param {String} type the severity of the message(ERROR, WARN, INFO, or DEBUG)
     * @public
     */
    dust.log = function(message, type) {
      type = type || INFO;
      if (loggingLevels[type] >= loggingLevels[dust.debugLevel]) {
        log('[DUST:' + type + ']', message);
      }
    };

    dust.debugLevel = NONE;
    if(typeof process !== 'undefined' && process.env && /\bdust\b/.test(process.env.DEBUG)) {
      dust.debugLevel = DEBUG;
    }

  }());

  dust.helpers = {};

  dust.cache = {};

  dust.register = function(name, tmpl) {
    if (!name) {
      return;
    }
    tmpl.templateName = name;
    if (dust.config.cache !== false) {
      dust.cache[name] = tmpl;
    }
  };

  dust.render = function(nameOrTemplate, context, callback) {
    var chunk = new Stub(callback).head;
    try {
      load(nameOrTemplate, chunk, context).end();
    } catch (err) {
      chunk.setError(err);
    }
  };

  dust.stream = function(nameOrTemplate, context) {
    var stream = new Stream(),
        chunk = stream.head;
    dust.nextTick(function() {
      try {
        load(nameOrTemplate, chunk, context).end();
      } catch (err) {
        chunk.setError(err);
      }
    });
    return stream;
  };

  /**
   * Extracts a template function (body_0) from whatever is passed.
   * @param nameOrTemplate {*} Could be:
   *   - the name of a template to load from cache
   *   - a CommonJS-compiled template (a function with a `template` property)
   *   - a template function
   * @param loadFromCache {Boolean} if false, don't look in the cache
   * @return {Function} a template function, if found
   */
  function getTemplate(nameOrTemplate, loadFromCache/*=true*/) {
    if(!nameOrTemplate) {
      return;
    }
    if(typeof nameOrTemplate === 'function' && nameOrTemplate.template) {
      // Sugar away CommonJS module templates
      return nameOrTemplate.template;
    }
    if(dust.isTemplateFn(nameOrTemplate)) {
      // Template functions passed directly
      return nameOrTemplate;
    }
    if(loadFromCache !== false) {
      // Try loading a template with this name from cache
      return dust.cache[nameOrTemplate];
    }
  }

  function load(nameOrTemplate, chunk, context) {
    if(!nameOrTemplate) {
      return chunk.setError(new Error('No template or template name provided to render'));
    }

    var template = getTemplate(nameOrTemplate, dust.config.cache);

    if (template) {
      return template(chunk, Context.wrap(context, template.templateName));
    } else {
      if (dust.onLoad) {
        return chunk.map(function(chunk) {
          // Alias just so it's easier to read that this would always be a name
          var name = nameOrTemplate;
          // Three possible scenarios for a successful callback:
          //   - `require(nameOrTemplate)(dust); cb()`
          //   - `src = readFile('src.dust'); cb(null, src)`
          //   - `compiledTemplate = require(nameOrTemplate)(dust); cb(null, compiledTemplate)`
          function done(err, srcOrTemplate) {
            var template;
            if (err) {
              return chunk.setError(err);
            }
            // Prefer a template that is passed via callback over the cached version.
            template = getTemplate(srcOrTemplate, false) || getTemplate(name, dust.config.cache);
            if (!template) {
              // It's a template string, compile it and register under `name`
              if(dust.compile) {
                template = dust.loadSource(dust.compile(srcOrTemplate, name));
              } else {
                return chunk.setError(new Error('Dust compiler not available'));
              }
            }
            template(chunk, Context.wrap(context, template.templateName)).end();
          }

          if(dust.onLoad.length === 3) {
            dust.onLoad(name, context.options, done);
          } else {
            dust.onLoad(name, done);
          }
        });
      }
      return chunk.setError(new Error('Template Not Found: ' + nameOrTemplate));
    }
  }

  dust.loadSource = function(source) {
    /*jshint evil:true*/
    return eval(source);
  };

  if (Array.isArray) {
    dust.isArray = Array.isArray;
  } else {
    dust.isArray = function(arr) {
      return Object.prototype.toString.call(arr) === '[object Array]';
    };
  }

  dust.nextTick = (function() {
    return function(callback) {
      setTimeout(callback, 0);
    };
  })();

  /**
   * Dust has its own rules for what is "empty"-- which is not the same as falsy.
   * Empty arrays, null, and undefined are empty
   */
  dust.isEmpty = function(value) {
    if (value === 0) {
      return false;
    }
    if (dust.isArray(value) && !value.length) {
      return true;
    }
    return !value;
  };

  dust.isEmptyObject = function(obj) {
    var key;
    if (obj === null) {
      return false;
    }
    if (obj === undefined) {
      return false;
    }
    if (obj.length > 0) {
      return false;
    }
    for (key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        return false;
      }
    }
    return true;
  };

  dust.isTemplateFn = function(elem) {
    return typeof elem === 'function' &&
           elem.__dustBody;
  };

  /**
   * Decide somewhat-naively if something is a Thenable.
   * @param elem {*} object to inspect
   * @return {Boolean} is `elem` a Thenable?
   */
  dust.isThenable = function(elem) {
    return elem &&
           typeof elem === 'object' &&
           typeof elem.then === 'function';
  };

  /**
   * Decide very naively if something is a Stream.
   * @param elem {*} object to inspect
   * @return {Boolean} is `elem` a Stream?
   */
  dust.isStreamable = function(elem) {
    return elem &&
           typeof elem.on === 'function' &&
           typeof elem.pipe === 'function';
  };

  // apply the filter chain and return the output string
  dust.filter = function(string, auto, filters, context) {
    var i, len, name, filter;
    if (filters) {
      for (i = 0, len = filters.length; i < len; i++) {
        name = filters[i];
        if (!name.length) {
          continue;
        }
        filter = dust.filters[name];
        if (name === 's') {
          auto = null;
        } else if (typeof filter === 'function') {
          string = filter(string, context);
        } else {
          dust.log('Invalid filter `' + name + '`', WARN);
        }
      }
    }
    // by default always apply the h filter, unless asked to unescape with |s
    if (auto) {
      string = dust.filters[auto](string, context);
    }
    return string;
  };

  dust.filters = {
    h: function(value) { return dust.escapeHtml(value); },
    j: function(value) { return dust.escapeJs(value); },
    u: encodeURI,
    uc: encodeURIComponent,
    js: function(value) { return dust.escapeJSON(value); },
    jp: function(value) {
      if (!JSON) {dust.log('JSON is undefined; could not parse `' + value + '`', WARN);
        return value;
      } else {
        return JSON.parse(value);
      }
    }
  };

  function Context(stack, global, options, blocks, templateName) {
    if(stack !== undefined && !(stack instanceof Stack)) {
      stack = new Stack(stack);
    }
    this.stack = stack;
    this.global = global;
    this.options = options;
    this.blocks = blocks;
    this.templateName = templateName;
  }

  dust.makeBase = dust.context = function(global, options) {
    return new Context(undefined, global, options);
  };

  /**
   * Factory function that creates a closure scope around a Thenable-callback.
   * Returns a function that can be passed to a Thenable that will resume a
   * Context lookup once the Thenable resolves with new data, adding that new
   * data to the lookup stack.
   */
  function getWithResolvedData(ctx, cur, down) {
    return function(data) {
      return ctx.push(data)._get(cur, down);
    };
  }

  Context.wrap = function(context, name) {
    if (context instanceof Context) {
      return context;
    }
    return new Context(context, {}, {}, null, name);
  };

  /**
   * Public API for getting a value from the context.
   * @method get
   * @param {string|array} path The path to the value. Supported formats are:
   * 'key'
   * 'path.to.key'
   * '.path.to.key'
   * ['path', 'to', 'key']
   * ['key']
   * @param {boolean} [cur=false] Boolean which determines if the search should be limited to the
   * current context (true), or if get should search in parent contexts as well (false).
   * @public
   * @returns {string|object}
   */
  Context.prototype.get = function(path, cur) {
    if (typeof path === 'string') {
      if (path[0] === '.') {
        cur = true;
        path = path.substr(1);
      }
      path = path.split('.');
    }
    return this._get(cur, path);
  };

  /**
   * Get a value from the context
   * @method _get
   * @param {boolean} cur Get only from the current context
   * @param {array} down An array of each step in the path
   * @private
   * @return {string | object}
   */
  Context.prototype._get = function(cur, down) {
    var ctx = this.stack || {},
        i = 1,
        value, first, len, ctxThis, fn;

    first = down[0];
    len = down.length;

    if (cur && len === 0) {
      ctxThis = ctx;
      ctx = ctx.head;
    } else {
      if (!cur) {
        // Search up the stack for the first value
        while (ctx) {
          if (ctx.isObject) {
            ctxThis = ctx.head;
            value = ctx.head[first];
            if (value !== undefined) {
              break;
            }
          }
          ctx = ctx.tail;
        }

        // Try looking in the global context if we haven't found anything yet
        if (value !== undefined) {
          ctx = value;
        } else {
          ctx = this.global && this.global[first];
        }
      } else if (ctx) {
        // if scope is limited by a leading dot, don't search up the tree
        if(ctx.head) {
          ctx = ctx.head[first];
        } else {
          // context's head is empty, value we are searching for is not defined
          ctx = undefined;
        }
      }

      while (ctx && i < len) {
        if (dust.isThenable(ctx)) {
          // Bail early by returning a Thenable for the remainder of the search tree
          return ctx.then(getWithResolvedData(this, cur, down.slice(i)));
        }
        ctxThis = ctx;
        ctx = ctx[down[i]];
        i++;
      }
    }

    if (typeof ctx === 'function') {
      fn = function() {
        try {
          return ctx.apply(ctxThis, arguments);
        } catch (err) {
          dust.log(err, ERROR);
          throw err;
        }
      };
      fn.__dustBody = !!ctx.__dustBody;
      return fn;
    } else {
      if (ctx === undefined) {
        dust.log('Cannot find reference `{' + down.join('.') + '}` in template `' + this.getTemplateName() + '`', INFO);
      }
      return ctx;
    }
  };

  Context.prototype.getPath = function(cur, down) {
    return this._get(cur, down);
  };

  Context.prototype.push = function(head, idx, len) {
    if(head === undefined) {
      dust.log("Not pushing an undefined variable onto the context", INFO);
      return this;
    }
    return this.rebase(new Stack(head, this.stack, idx, len));
  };

  Context.prototype.pop = function() {
    var head = this.current();
    this.stack = this.stack && this.stack.tail;
    return head;
  };

  Context.prototype.rebase = function(head) {
    return new Context(head, this.global, this.options, this.blocks, this.getTemplateName());
  };

  Context.prototype.clone = function() {
    var context = this.rebase();
    context.stack = this.stack;
    return context;
  };

  Context.prototype.current = function() {
    return this.stack && this.stack.head;
  };

  Context.prototype.getBlock = function(key) {
    var blocks, len, fn;

    if (typeof key === 'function') {
      key = key(new Chunk(), this).data.join('');
    }

    blocks = this.blocks;

    if (!blocks) {
      dust.log('No blocks for context `' + key + '` in template `' + this.getTemplateName() + '`', DEBUG);
      return false;
    }

    len = blocks.length;
    while (len--) {
      fn = blocks[len][key];
      if (fn) {
        return fn;
      }
    }

    dust.log('Malformed template `' + this.getTemplateName() + '` was missing one or more blocks.');
    return false;
  };

  Context.prototype.shiftBlocks = function(locals) {
    var blocks = this.blocks,
        newBlocks;

    if (locals) {
      if (!blocks) {
        newBlocks = [locals];
      } else {
        newBlocks = blocks.concat([locals]);
      }
      return new Context(this.stack, this.global, this.options, newBlocks, this.getTemplateName());
    }
    return this;
  };

  Context.prototype.resolve = function(body) {
    var chunk;

    if(typeof body !== 'function') {
      return body;
    }
    chunk = new Chunk().render(body, this);
    if(chunk instanceof Chunk) {
      return chunk.data.join(''); // ie7 perf
    }
    return chunk;
  };

  Context.prototype.getTemplateName = function() {
    return this.templateName;
  };

  function Stack(head, tail, idx, len) {
    this.tail = tail;
    this.isObject = head && typeof head === 'object';
    this.head = head;
    this.index = idx;
    this.of = len;
  }

  function Stub(callback) {
    this.head = new Chunk(this);
    this.callback = callback;
    this.out = '';
  }

  Stub.prototype.flush = function() {
    var chunk = this.head;

    while (chunk) {
      if (chunk.flushable) {
        this.out += chunk.data.join(''); //ie7 perf
      } else if (chunk.error) {
        this.callback(chunk.error);
        dust.log('Rendering failed with error `' + chunk.error + '`', ERROR);
        this.flush = EMPTY_FUNC;
        return;
      } else {
        return;
      }
      chunk = chunk.next;
      this.head = chunk;
    }
    this.callback(null, this.out);
  };

  /**
   * Creates an interface sort of like a Streams2 ReadableStream.
   */
  function Stream() {
    this.head = new Chunk(this);
  }

  Stream.prototype.flush = function() {
    var chunk = this.head;

    while(chunk) {
      if (chunk.flushable) {
        this.emit('data', chunk.data.join('')); //ie7 perf
      } else if (chunk.error) {
        this.emit('error', chunk.error);
        this.emit('end');
        dust.log('Streaming failed with error `' + chunk.error + '`', ERROR);
        this.flush = EMPTY_FUNC;
        return;
      } else {
        return;
      }
      chunk = chunk.next;
      this.head = chunk;
    }
    this.emit('end');
  };

  /**
   * Executes listeners for `type` by passing data. Note that this is different from a
   * Node stream, which can pass an arbitrary number of arguments
   * @return `true` if event had listeners, `false` otherwise
   */
  Stream.prototype.emit = function(type, data) {
    var events = this.events || {},
        handlers = events[type] || [],
        i, l;

    if (!handlers.length) {
      dust.log('Stream broadcasting, but no listeners for `' + type + '`', DEBUG);
      return false;
    }

    handlers = handlers.slice(0);
    for (i = 0, l = handlers.length; i < l; i++) {
      handlers[i](data);
    }
    return true;
  };

  Stream.prototype.on = function(type, callback) {
    var events = this.events = this.events || {},
        handlers = events[type] = events[type] || [];

    if(typeof callback !== 'function') {
      dust.log('No callback function provided for `' + type + '` event listener', WARN);
    } else {
      handlers.push(callback);
    }
    return this;
  };

  /**
   * Pipes to a WritableStream. Note that backpressure isn't implemented,
   * so we just write as fast as we can.
   * @param stream {WritableStream}
   * @return self
   */
  Stream.prototype.pipe = function(stream) {
    if(typeof stream.write !== 'function' ||
       typeof stream.end !== 'function') {
      dust.log('Incompatible stream passed to `pipe`', WARN);
      return this;
    }

    var destEnded = false;

    if(typeof stream.emit === 'function') {
      stream.emit('pipe', this);
    }

    if(typeof stream.on === 'function') {
      stream.on('error', function() {
        destEnded = true;
      });
    }

    return this
    .on('data', function(data) {
      if(destEnded) {
        return;
      }
      try {
        stream.write(data, 'utf8');
      } catch (err) {
        dust.log(err, ERROR);
      }
    })
    .on('end', function() {
      if(destEnded) {
        return;
      }
      try {
        stream.end();
        destEnded = true;
      } catch (err) {
        dust.log(err, ERROR);
      }
    });
  };

  function Chunk(root, next, taps) {
    this.root = root;
    this.next = next;
    this.data = []; //ie7 perf
    this.flushable = false;
    this.taps = taps;
  }

  Chunk.prototype.write = function(data) {
    var taps = this.taps;

    if (taps) {
      data = taps.go(data);
    }
    this.data.push(data);
    return this;
  };

  Chunk.prototype.end = function(data) {
    if (data) {
      this.write(data);
    }
    this.flushable = true;
    this.root.flush();
    return this;
  };

  Chunk.prototype.map = function(callback) {
    var cursor = new Chunk(this.root, this.next, this.taps),
        branch = new Chunk(this.root, cursor, this.taps);

    this.next = branch;
    this.flushable = true;
    try {
      callback(branch);
    } catch(err) {
      dust.log(err, ERROR);
      branch.setError(err);
    }
    return cursor;
  };

  Chunk.prototype.tap = function(tap) {
    var taps = this.taps;

    if (taps) {
      this.taps = taps.push(tap);
    } else {
      this.taps = new Tap(tap);
    }
    return this;
  };

  Chunk.prototype.untap = function() {
    this.taps = this.taps.tail;
    return this;
  };

  Chunk.prototype.render = function(body, context) {
    return body(this, context);
  };

  Chunk.prototype.reference = function(elem, context, auto, filters) {
    if (typeof elem === 'function') {
      elem = elem.apply(context.current(), [this, context, null, {auto: auto, filters: filters}]);
      if (elem instanceof Chunk) {
        return elem;
      } else {
        return this.reference(elem, context, auto, filters);
      }
    }
    if (dust.isThenable(elem)) {
      return this.await(elem, context, null, auto, filters);
    } else if (dust.isStreamable(elem)) {
      return this.stream(elem, context, null, auto, filters);
    } else if (!dust.isEmpty(elem)) {
      return this.write(dust.filter(elem, auto, filters, context));
    } else {
      return this;
    }
  };

  Chunk.prototype.section = function(elem, context, bodies, params) {
    var body = bodies.block,
        skip = bodies['else'],
        chunk = this,
        i, len, head;

    if (typeof elem === 'function' && !dust.isTemplateFn(elem)) {
      try {
        elem = elem.apply(context.current(), [this, context, bodies, params]);
      } catch(err) {
        dust.log(err, ERROR);
        return this.setError(err);
      }
      // Functions that return chunks are assumed to have handled the chunk manually.
      // Make that chunk the current one and go to the next method in the chain.
      if (elem instanceof Chunk) {
        return elem;
      }
    }

    if (dust.isEmptyObject(bodies)) {
      // No bodies to render, and we've already invoked any function that was available in
      // hopes of returning a Chunk.
      return chunk;
    }

    if (!dust.isEmptyObject(params)) {
      context = context.push(params);
    }

    /*
    Dust's default behavior is to enumerate over the array elem, passing each object in the array to the block.
    When elem resolves to a value or object instead of an array, Dust sets the current context to the value
    and renders the block one time.
    */
    if (dust.isArray(elem)) {
      if (body) {
        len = elem.length;
        if (len > 0) {
          head = context.stack && context.stack.head || {};
          head.$len = len;
          for (i = 0; i < len; i++) {
            head.$idx = i;
            chunk = body(chunk, context.push(elem[i], i, len));
          }
          head.$idx = undefined;
          head.$len = undefined;
          return chunk;
        } else if (skip) {
          return skip(this, context);
        }
      }
    } else if (dust.isThenable(elem)) {
      return this.await(elem, context, bodies);
    } else if (dust.isStreamable(elem)) {
      return this.stream(elem, context, bodies);
    } else if (elem === true) {
     // true is truthy but does not change context
      if (body) {
        return body(this, context);
      }
    } else if (elem || elem === 0) {
       // everything that evaluates to true are truthy ( e.g. Non-empty strings and Empty objects are truthy. )
       // zero is truthy
       // for anonymous functions that did not returns a chunk, truthiness is evaluated based on the return value
      if (body) {
        return body(this, context.push(elem));
      }
     // nonexistent, scalar false value, scalar empty string, null,
     // undefined are all falsy
    } else if (skip) {
      return skip(this, context);
    }
    dust.log('Section without corresponding key in template `' + context.getTemplateName() + '`', DEBUG);
    return this;
  };

  Chunk.prototype.exists = function(elem, context, bodies) {
    var body = bodies.block,
        skip = bodies['else'];

    if (!dust.isEmpty(elem)) {
      if (body) {
        return body(this, context);
      }
      dust.log('No block for exists check in template `' + context.getTemplateName() + '`', DEBUG);
    } else if (skip) {
      return skip(this, context);
    }
    return this;
  };

  Chunk.prototype.notexists = function(elem, context, bodies) {
    var body = bodies.block,
        skip = bodies['else'];

    if (dust.isEmpty(elem)) {
      if (body) {
        return body(this, context);
      }
      dust.log('No block for not-exists check in template `' + context.getTemplateName() + '`', DEBUG);
    } else if (skip) {
      return skip(this, context);
    }
    return this;
  };

  Chunk.prototype.block = function(elem, context, bodies) {
    var body = elem || bodies.block;

    if (body) {
      return body(this, context);
    }
    return this;
  };

  Chunk.prototype.partial = function(elem, context, partialContext, params) {
    var head;

    if(params === undefined) {
      // Compatibility for < 2.7.0 where `partialContext` did not exist
      params = partialContext;
      partialContext = context;
    }

    if (!dust.isEmptyObject(params)) {
      partialContext = partialContext.clone();
      head = partialContext.pop();
      partialContext = partialContext.push(params)
                                     .push(head);
    }

    if (dust.isTemplateFn(elem)) {
      // The eventual result of evaluating `elem` is a partial name
      // Load the partial after getting its name and end the async chunk
      return this.capture(elem, context, function(name, chunk) {
        partialContext.templateName = name;
        load(name, chunk, partialContext).end();
      });
    } else {
      partialContext.templateName = elem;
      return load(elem, this, partialContext);
    }
  };

  Chunk.prototype.helper = function(name, context, bodies, params, auto) {
    var chunk = this,
        filters = params.filters,
        ret;

    // Pre-2.7.1 compat: if auto is undefined, it's an old template. Automatically escape
    if (auto === undefined) {
      auto = 'h';
    }

    // handle invalid helpers, similar to invalid filters
    if(dust.helpers[name]) {
      try {
        ret = dust.helpers[name](chunk, context, bodies, params);
        if (ret instanceof Chunk) {
          return ret;
        }
        if(typeof filters === 'string') {
          filters = filters.split('|');
        }
        if (!dust.isEmptyObject(bodies)) {
          return chunk.section(ret, context, bodies, params);
        }
        // Helpers act slightly differently from functions in context in that they will act as
        // a reference if they are self-closing (due to grammar limitations)
        // In the Chunk.await function we check to make sure bodies is null before acting as a reference
        return chunk.reference(ret, context, auto, filters);
      } catch(err) {
        dust.log('Error in helper `' + name + '`: ' + err.message, ERROR);
        return chunk.setError(err);
      }
    } else {
      dust.log('Helper `' + name + '` does not exist', WARN);
      return chunk;
    }
  };

  /**
   * Reserve a chunk to be evaluated once a thenable is resolved or rejected
   * @param thenable {Thenable} the target thenable to await
   * @param context {Context} context to use to render the deferred chunk
   * @param bodies {Object} must contain a "body", may contain an "error"
   * @param auto {String} automatically apply this filter if the Thenable is a reference
   * @param filters {Array} apply these filters if the Thenable is a reference
   * @return {Chunk}
   */
  Chunk.prototype.await = function(thenable, context, bodies, auto, filters) {
    return this.map(function(chunk) {
      thenable.then(function(data) {
        if (bodies) {
          chunk = chunk.section(data, context, bodies);
        } else {
          // Actually a reference. Self-closing sections don't render
          chunk = chunk.reference(data, context, auto, filters);
        }
        chunk.end();
      }, function(err) {
        var errorBody = bodies && bodies.error;
        if(errorBody) {
          chunk.render(errorBody, context.push(err)).end();
        } else {
          dust.log('Unhandled promise rejection in `' + context.getTemplateName() + '`', INFO);
          chunk.end();
        }
      });
    });
  };

  /**
   * Reserve a chunk to be evaluated with the contents of a streamable.
   * Currently an error event will bomb out the stream. Once an error
   * is received, we push it to an {:error} block if one exists, and log otherwise,
   * then stop listening to the stream.
   * @param streamable {Streamable} the target streamable that will emit events
   * @param context {Context} context to use to render each thunk
   * @param bodies {Object} must contain a "body", may contain an "error"
   * @return {Chunk}
   */
  Chunk.prototype.stream = function(stream, context, bodies, auto, filters) {
    var body = bodies && bodies.block,
        errorBody = bodies && bodies.error;
    return this.map(function(chunk) {
      var ended = false;
      stream
        .on('data', function data(thunk) {
          if(ended) {
            return;
          }
          if(body) {
            // Fork a new chunk out of the blockstream so that we can flush it independently
            chunk = chunk.map(function(chunk) {
              chunk.render(body, context.push(thunk)).end();
            });
          } else if(!bodies) {
            // When actually a reference, don't fork, just write into the master async chunk
            chunk = chunk.reference(thunk, context, auto, filters);
          }
        })
        .on('error', function error(err) {
          if(ended) {
            return;
          }
          if(errorBody) {
            chunk.render(errorBody, context.push(err));
          } else {
            dust.log('Unhandled stream error in `' + context.getTemplateName() + '`', INFO);
          }
          if(!ended) {
            ended = true;
            chunk.end();
          }
        })
        .on('end', function end() {
          if(!ended) {
            ended = true;
            chunk.end();
          }
        });
    });
  };

  Chunk.prototype.capture = function(body, context, callback) {
    return this.map(function(chunk) {
      var stub = new Stub(function(err, out) {
        if (err) {
          chunk.setError(err);
        } else {
          callback(out, chunk);
        }
      });
      body(stub.head, context).end();
    });
  };

  Chunk.prototype.setError = function(err) {
    this.error = err;
    this.root.flush();
    return this;
  };

  // Chunk aliases
  for(var f in Chunk.prototype) {
    if(dust._aliases[f]) {
      Chunk.prototype[dust._aliases[f]] = Chunk.prototype[f];
    }
  }

  function Tap(head, tail) {
    this.head = head;
    this.tail = tail;
  }

  Tap.prototype.push = function(tap) {
    return new Tap(tap, this);
  };

  Tap.prototype.go = function(value) {
    var tap = this;

    while(tap) {
      value = tap.head(value);
      tap = tap.tail;
    }
    return value;
  };

  var HCHARS = /[&<>"']/,
      AMP    = /&/g,
      LT     = /</g,
      GT     = />/g,
      QUOT   = /\"/g,
      SQUOT  = /\'/g;

  dust.escapeHtml = function(s) {
    if (typeof s === "string" || (s && typeof s.toString === "function")) {
      if (typeof s !== "string") {
        s = s.toString();
      }
      if (!HCHARS.test(s)) {
        return s;
      }
      return s.replace(AMP,'&amp;').replace(LT,'&lt;').replace(GT,'&gt;').replace(QUOT,'&quot;').replace(SQUOT, '&#39;');
    }
    return s;
  };

  var BS = /\\/g,
      FS = /\//g,
      CR = /\r/g,
      LS = /\u2028/g,
      PS = /\u2029/g,
      NL = /\n/g,
      LF = /\f/g,
      SQ = /'/g,
      DQ = /"/g,
      TB = /\t/g;

  dust.escapeJs = function(s) {
    if (typeof s === 'string') {
      return s
        .replace(BS, '\\\\')
        .replace(FS, '\\/')
        .replace(DQ, '\\"')
        .replace(SQ, '\\\'')
        .replace(CR, '\\r')
        .replace(LS, '\\u2028')
        .replace(PS, '\\u2029')
        .replace(NL, '\\n')
        .replace(LF, '\\f')
        .replace(TB, '\\t');
    }
    return s;
  };

  dust.escapeJSON = function(o) {
    if (!JSON) {
      dust.log('JSON is undefined; could not escape `' + o + '`', WARN);
      return o;
    } else {
      return JSON.stringify(o)
        .replace(LS, '\\u2028')
        .replace(PS, '\\u2029')
        .replace(LT, '\\u003c');
    }
  };

  return dust;

}));

if (typeof define === "function" && define.amd && define.amd.dust === true) {
    define(["require", "dust.core"], function(require, dust) {
        dust.onLoad = function(name, cb) {
            require([name], function() {
                cb();
            });
        };
        return dust;
    });
}

/*! dustjs-helpers - v1.7.3
* http://dustjs.com/
* Copyright (c) 2015 Aleksander Williams; Released under the MIT License */
(function(root, factory) {
  if (typeof define === 'function' && define.amd && define.amd.dust === true) {
    define(['dust.core'], factory);
  } else if (typeof exports === 'object') {
    module.exports = factory(require('dustjs-linkedin'));
  } else {
    factory(root.dust);
  }
}(this, function(dust) {

function log(helper, msg, level) {
  level = level || "INFO";
  helper = helper ? '{@' + helper + '}: ' : '';
  dust.log(helper + msg, level);
}

var _deprecatedCache = {};
function _deprecated(target) {
  if(_deprecatedCache[target]) { return; }
  log(target, "Deprecation warning: " + target + " is deprecated and will be removed in a future version of dustjs-helpers", "WARN");
  log(null, "For help and a deprecation timeline, see https://github.com/linkedin/dustjs-helpers/wiki/Deprecated-Features#" + target.replace(/\W+/g, ""), "WARN");
  _deprecatedCache[target] = true;
}

function isSelect(context) {
  return context.stack.tail &&
         context.stack.tail.head &&
         typeof context.stack.tail.head.__select__ !== "undefined";
}

function getSelectState(context) {
  return isSelect(context) && context.get('__select__');
}

/**
 * Adds a special __select__ key behind the head of the context stack. Used to maintain the state
 * of {@select} blocks
 * @param context {Context} add state to this Context
 * @param opts {Object} add these properties to the state (`key` and `type`)
 */
function addSelectState(context, opts) {
  var head = context.stack.head,
      newContext = context.rebase(),
      key;

  if(context.stack && context.stack.tail) {
    newContext.stack = context.stack.tail;
  }

  var state = {
    isPending: false,
    isResolved: false,
    isDeferredComplete: false,
    deferreds: []
  };

  for(key in opts) {
    state[key] = opts[key];
  }

  return newContext
  .push({ "__select__": state })
  .push(head, context.stack.index, context.stack.of);
}

/**
 * After a {@select} or {@math} block is complete, they invoke this function
 */
function resolveSelectDeferreds(state) {
  var x, len;
  state.isDeferredPending = true;
  if(state.deferreds.length) {
    state.isDeferredComplete = true;
    for(x=0, len=state.deferreds.length; x<len; x++) {
      state.deferreds[x]();
    }
  }
  state.isDeferredPending = false;
}

/**
 * Used by {@contextDump}
 */
function jsonFilter(key, value) {
  if (typeof value === "function") {
    return value.toString()
      .replace(/(^\s+|\s+$)/mg, '')
      .replace(/\n/mg, '')
      .replace(/,\s*/mg, ', ')
      .replace(/\)\{/mg, ') {');
  }
  return value;
}

/**
 * Generate a truth test helper
 */
function truthTest(name, test) {
  return function(chunk, context, bodies, params) {
    return filter(chunk, context, bodies, params, name, test);
  };
}

/**
 * This function is invoked by truth test helpers
 */
function filter(chunk, context, bodies, params, helperName, test) {
  var body = bodies.block,
      skip = bodies['else'],
      selectState = getSelectState(context) || {},
      willResolve, key, value, type;

  // Once one truth test in a select passes, short-circuit the rest of the tests
  if (selectState.isResolved && !selectState.isDeferredPending) {
    return chunk;
  }

  // First check for a key on the helper itself, then look for a key on the {@select}
  if (params.hasOwnProperty('key')) {
    key = params.key;
  } else if (selectState.hasOwnProperty('key')) {
    key = selectState.key;
  } else {
    log(helperName, "No key specified", "WARN");
    return chunk;
  }

  type = params.type || selectState.type;

  key = coerce(context.resolve(key), type);
  value = coerce(context.resolve(params.value), type);

  if (test(key, value)) {
    // Once a truth test passes, put the select into "pending" state. Now we can render the body of
    // the truth test (which may contain truth tests) without altering the state of the select.
    if (!selectState.isPending) {
      willResolve = true;
      selectState.isPending = true;
    }
    if (body) {
      chunk = chunk.render(body, context);
    }
    if (willResolve) {
      selectState.isResolved = true;
    }
  } else if (skip) {
    chunk = chunk.render(skip, context);
  }
  return chunk;
}

function coerce(value, type) {
  if (type) {
    type = type.toLowerCase();
  }
  switch (type) {
    case 'number': return +value;
    case 'string': return String(value);
    case 'boolean':
      value = (value === 'false' ? false : value);
      return Boolean(value);
    case 'date': return new Date(value);
  }

  return value;
}

var helpers = {

  // Utility helping to resolve dust references in the given chunk
  // uses native Dust Context#resolve (available since Dust 2.6.2)
  "tap": function(input, chunk, context) {
    // deprecated for removal in 1.8
    _deprecated("tap");
    return context.resolve(input);
  },

  "sep": function(chunk, context, bodies) {
    var body = bodies.block;
    if (context.stack.index === context.stack.of - 1) {
      return chunk;
    }
    if (body) {
      return body(chunk, context);
    } else {
      return chunk;
    }
  },

  "first": function(chunk, context, bodies) {
    if (context.stack.index === 0) {
      return bodies.block(chunk, context);
    }
    return chunk;
  },

  "last": function(chunk, context, bodies) {
    if (context.stack.index === context.stack.of - 1) {
      return bodies.block(chunk, context);
    }
    return chunk;
  },

  /**
   * {@contextDump}
   * @param key {String} set to "full" to the full context stack, otherwise the current context is dumped
   * @param to {String} set to "console" to log to console, otherwise outputs to the chunk
   */
  "contextDump": function(chunk, context, bodies, params) {
    var to = context.resolve(params.to),
        key = context.resolve(params.key),
        target, output;
    switch(key) {
      case 'full':
        target = context.stack;
        break;
      default:
        target = context.stack.head;
    }
    output = JSON.stringify(target, jsonFilter, 2);
    switch(to) {
      case 'console':
        log('contextDump', output);
        break;
      default:
        output = output.replace(/</g, '\\u003c');
        chunk = chunk.write(output);
    }
    return chunk;
  },

  /**
   * {@math}
   * @param key first value
   * @param method {String} operation to perform
   * @param operand second value (not required for operations like `abs`)
   * @param round if truthy, round() the result
   */
  "math": function (chunk, context, bodies, params) {
    var key = params.key,
        method = params.method,
        operand = params.operand,
        round = params.round,
        output, state, x, len;

    if(!params.hasOwnProperty('key') || !params.method) {
      log("math", "`key` or `method` was not provided", "ERROR");
      return chunk;
    }

    key = parseFloat(context.resolve(key));
    operand = parseFloat(context.resolve(operand));

    switch(method) {
      case "mod":
        if(operand === 0) {
          log("math", "Division by 0", "ERROR");
        }
        output = key % operand;
        break;
      case "add":
        output = key + operand;
        break;
      case "subtract":
        output = key - operand;
        break;
      case "multiply":
        output = key * operand;
        break;
      case "divide":
        if(operand === 0) {
          log("math", "Division by 0", "ERROR");
        }
        output = key / operand;
        break;
      case "ceil":
      case "floor":
      case "round":
      case "abs":
        output = Math[method](key);
        break;
      case "toint":
        output = parseInt(key, 10);
        break;
      default:
        log("math", "Method `" + method + "` is not supported", "ERROR");
    }

    if (typeof output !== 'undefined') {
      if (round) {
        output = Math.round(output);
      }
      if (bodies && bodies.block) {
        context = addSelectState(context, { key: output });
        chunk = chunk.render(bodies.block, context);
        resolveSelectDeferreds(getSelectState(context));
      } else {
        chunk = chunk.write(output);
      }
    }

    return chunk;
  },

  /**
   * {@select}
   * Groups a set of truth tests and outputs the first one that passes.
   * Also contains {@any} and {@none} blocks.
   * @param key a value or reference to use as the left-hand side of comparisons
   * @param type coerce all truth test keys without an explicit type to this type
   */
  "select": function(chunk, context, bodies, params) {
    var body = bodies.block,
        state = {};

    if (params.hasOwnProperty('key')) {
      state.key = context.resolve(params.key);
    }
    if (params.hasOwnProperty('type')) {
      state.type = params.type;
    }

    if (body) {
      context = addSelectState(context, state);
      chunk = chunk.render(body, context);
      resolveSelectDeferreds(getSelectState(context));
    } else {
      log("select", "Missing body block", "WARN");
    }
    return chunk;
  },

  /**
   * Truth test helpers
   * @param key a value or reference to use as the left-hand side of comparisons
   * @param value a value or reference to use as the right-hand side of comparisons
   * @param type if specified, `key` and `value` will be forcibly cast to this type
   */
  "eq": truthTest('eq', function(left, right) {
    return left === right;
  }),
  "ne": truthTest('ne', function(left, right) {
    return left !== right;
  }),
  "lt": truthTest('lt', function(left, right) {
    return left < right;
  }),
  "lte": truthTest('lte', function(left, right) {
    return left <= right;
  }),
  "gt": truthTest('gt', function(left, right) {
    return left > right;
  }),
  "gte": truthTest('gte', function(left, right) {
    return left >= right;
  }),

  /**
   * {@any}
   * Outputs as long as at least one truth test inside a {@select} has passed.
   * Must be contained inside a {@select} block.
   * The passing truth test can be before or after the {@any} block.
   */
  "any": function(chunk, context, bodies, params) {
    var selectState = getSelectState(context);

    if(!selectState) {
      log("any", "Must be used inside a {@select} block", "ERROR");
    } else {
      if(selectState.isDeferredComplete) {
        log("any", "Must not be nested inside {@any} or {@none} block", "ERROR");
      } else {
        chunk = chunk.map(function(chunk) {
          selectState.deferreds.push(function() {
            if(selectState.isResolved) {
              chunk = chunk.render(bodies.block, context);
            }
            chunk.end();
          });
        });
      }
    }
    return chunk;
  },

  /**
   * {@none}
   * Outputs if no truth tests inside a {@select} pass.
   * Must be contained inside a {@select} block.
   * The position of the helper does not matter.
   */
  "none": function(chunk, context, bodies, params) {
    var selectState = getSelectState(context);

    if(!selectState) {
      log("none", "Must be used inside a {@select} block", "ERROR");
    } else {
      if(selectState.isDeferredComplete) {
        log("none", "Must not be nested inside {@any} or {@none} block", "ERROR");
      } else {
        chunk = chunk.map(function(chunk) {
          selectState.deferreds.push(function() {
            if(!selectState.isResolved) {
              chunk = chunk.render(bodies.block, context);
            }
            chunk.end();
          });
        });
      }
    }
    return chunk;
  },

  /**
  * {@size}
  * Write the size of the target to the chunk
  * Falsy values and true have size 0
  * Numbers are returned as-is
  * Arrays and Strings have size equal to their length
  * Objects have size equal to the number of keys they contain
  * Dust bodies are evaluated and the length of the string is returned
  * Functions are evaluated and the length of their return value is evaluated
  * @param key find the size of this value or reference
  */
  "size": function(chunk, context, bodies, params) {
    var key = params.key,
        value, k;

    key = context.resolve(params.key);
    if (!key || key === true) {
      value = 0;
    } else if(dust.isArray(key)) {
      value = key.length;
    } else if (!isNaN(parseFloat(key)) && isFinite(key)) {
      value = key;
    } else if (typeof key === "object") {
      value = 0;
      for(k in key){
        if(key.hasOwnProperty(k)){
          value++;
        }
      }
    } else {
      value = (key + '').length;
    }
    return chunk.write(value);
  }

};

for(var key in helpers) {
  dust.helpers[key] = helpers[key];
}

return dust;

}));

!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.page=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (process){
  /* globals require, module */

  'use strict';

  /**
   * Module dependencies.
   */

  var pathtoRegexp = require('path-to-regexp');

  /**
   * Module exports.
   */

  module.exports = page;

  /**
   * Detect click event
   */
  var clickEvent = ('undefined' !== typeof document) && document.ontouchstart ? 'touchstart' : 'click';

  /**
   * To work properly with the URL
   * history.location generated polyfill in https://github.com/devote/HTML5-History-API
   */

  var location = ('undefined' !== typeof window) && (window.history.location || window.location);

  /**
   * Perform initial dispatch.
   */

  var dispatch = true;


  /**
   * Decode URL components (query string, pathname, hash).
   * Accommodates both regular percent encoding and x-www-form-urlencoded format.
   */
  var decodeURLComponents = true;

  /**
   * Base path.
   */

  var base = '';

  /**
   * Running flag.
   */

  var running;

  /**
   * HashBang option
   */

  var hashbang = false;

  /**
   * Previous context, for capturing
   * page exit events.
   */

  var prevContext;

  /**
   * Register `path` with callback `fn()`,
   * or route `path`, or redirection,
   * or `page.start()`.
   *
   *   page(fn);
   *   page('*', fn);
   *   page('/user/:id', load, user);
   *   page('/user/' + user.id, { some: 'thing' });
   *   page('/user/' + user.id);
   *   page('/from', '/to')
   *   page();
   *
   * @param {string|!Function|!Object} path
   * @param {Function=} fn
   * @api public
   */

  function page(path, fn) {
    // <callback>
    if ('function' === typeof path) {
      return page('*', path);
    }

    // route <path> to <callback ...>
    if ('function' === typeof fn) {
      var route = new Route(/** @type {string} */ (path));
      for (var i = 1; i < arguments.length; ++i) {
        page.callbacks.push(route.middleware(arguments[i]));
      }
      // show <path> with [state]
    } else if ('string' === typeof path) {
      page['string' === typeof fn ? 'redirect' : 'show'](path, fn);
      // start [options]
    } else {
      page.start(path);
    }
  }

  /**
   * Callback functions.
   */

  page.callbacks = [];
  page.exits = [];

  /**
   * Current path being processed
   * @type {string}
   */
  page.current = '';

  /**
   * Number of pages navigated to.
   * @type {number}
   *
   *     page.len == 0;
   *     page('/login');
   *     page.len == 1;
   */

  page.len = 0;

  /**
   * Get or set basepath to `path`.
   *
   * @param {string} path
   * @api public
   */

  page.base = function(path) {
    if (0 === arguments.length) return base;
    base = path;
  };

  /**
   * Bind with the given `options`.
   *
   * Options:
   *
   *    - `click` bind to click events [true]
   *    - `popstate` bind to popstate [true]
   *    - `dispatch` perform initial dispatch [true]
   *
   * @param {Object} options
   * @api public
   */

  page.start = function(options) {
    options = options || {};
    if (running) return;
    running = true;
    if (false === options.dispatch) dispatch = false;
    if (false === options.decodeURLComponents) decodeURLComponents = false;
    if (false !== options.popstate) window.addEventListener('popstate', onpopstate, false);
    if (false !== options.click) {
      document.addEventListener(clickEvent, onclick, false);
    }
    if (true === options.hashbang) hashbang = true;
    if (!dispatch) return;
    var url = (hashbang && ~location.hash.indexOf('#!')) ? location.hash.substr(2) + location.search : location.pathname + location.search + location.hash;
    page.replace(url, null, true, dispatch);
  };

  /**
   * Unbind click and popstate event handlers.
   *
   * @api public
   */

  page.stop = function() {
    if (!running) return;
    page.current = '';
    page.len = 0;
    running = false;
    document.removeEventListener(clickEvent, onclick, false);
    window.removeEventListener('popstate', onpopstate, false);
  };

  /**
   * Show `path` with optional `state` object.
   *
   * @param {string} path
   * @param {Object=} state
   * @param {boolean=} dispatch
   * @param {boolean=} push
   * @return {!Context}
   * @api public
   */

  page.show = function(path, state, dispatch, push) {
    var ctx = new Context(path, state);
    page.current = ctx.path;
    if (false !== dispatch) page.dispatch(ctx);
    if (false !== ctx.handled && false !== push) ctx.pushState();
    return ctx;
  };

  /**
   * Goes back in the history
   * Back should always let the current route push state and then go back.
   *
   * @param {string} path - fallback path to go back if no more history exists, if undefined defaults to page.base
   * @param {Object=} state
   * @api public
   */

  page.back = function(path, state) {
    if (page.len > 0) {
      // this may need more testing to see if all browsers
      // wait for the next tick to go back in history
      history.back();
      page.len--;
    } else if (path) {
      setTimeout(function() {
        page.show(path, state);
      });
    }else{
      setTimeout(function() {
        page.show(base, state);
      });
    }
  };


  /**
   * Register route to redirect from one path to other
   * or just redirect to another route
   *
   * @param {string} from - if param 'to' is undefined redirects to 'from'
   * @param {string=} to
   * @api public
   */
  page.redirect = function(from, to) {
    // Define route from a path to another
    if ('string' === typeof from && 'string' === typeof to) {
      page(from, function(e) {
        setTimeout(function() {
          page.replace(/** @type {!string} */ (to));
        }, 0);
      });
    }

    // Wait for the push state and replace it with another
    if ('string' === typeof from && 'undefined' === typeof to) {
      setTimeout(function() {
        page.replace(from);
      }, 0);
    }
  };

  /**
   * Replace `path` with optional `state` object.
   *
   * @param {string} path
   * @param {Object=} state
   * @param {boolean=} init
   * @param {boolean=} dispatch
   * @return {!Context}
   * @api public
   */


  page.replace = function(path, state, init, dispatch) {
    var ctx = new Context(path, state);
    page.current = ctx.path;
    ctx.init = init;
    ctx.save(); // save before dispatching, which may redirect
    if (false !== dispatch) page.dispatch(ctx);
    return ctx;
  };

  /**
   * Dispatch the given `ctx`.
   *
   * @param {Context} ctx
   * @api private
   */
  page.dispatch = function(ctx) {
    var prev = prevContext,
      i = 0,
      j = 0;

    prevContext = ctx;

    function nextExit() {
      var fn = page.exits[j++];
      if (!fn) return nextEnter();
      fn(prev, nextExit);
    }

    function nextEnter() {
      var fn = page.callbacks[i++];

      if (ctx.path !== page.current) {
        ctx.handled = false;
        return;
      }
      if (!fn) return unhandled(ctx);
      fn(ctx, nextEnter);
    }

    if (prev) {
      nextExit();
    } else {
      nextEnter();
    }
  };

  /**
   * Unhandled `ctx`. When it's not the initial
   * popstate then redirect. If you wish to handle
   * 404s on your own use `page('*', callback)`.
   *
   * @param {Context} ctx
   * @api private
   */
  function unhandled(ctx) {
    if (ctx.handled) return;
    var current;

    if (hashbang) {
      current = base + location.hash.replace('#!', '');
    } else {
      current = location.pathname + location.search;
    }

    if (current === ctx.canonicalPath) return;
    page.stop();
    ctx.handled = false;
    location.href = ctx.canonicalPath;
  }

  /**
   * Register an exit route on `path` with
   * callback `fn()`, which will be called
   * on the previous context when a new
   * page is visited.
   */
  page.exit = function(path, fn) {
    if (typeof path === 'function') {
      return page.exit('*', path);
    }

    var route = new Route(path);
    for (var i = 1; i < arguments.length; ++i) {
      page.exits.push(route.middleware(arguments[i]));
    }
  };

  /**
   * Remove URL encoding from the given `str`.
   * Accommodates whitespace in both x-www-form-urlencoded
   * and regular percent-encoded form.
   *
   * @param {string} val - URL component to decode
   */
  function decodeURLEncodedURIComponent(val) {
    if (typeof val !== 'string') { return val; }
    return decodeURLComponents ? decodeURIComponent(val.replace(/\+/g, ' ')) : val;
  }

  /**
   * Initialize a new "request" `Context`
   * with the given `path` and optional initial `state`.
   *
   * @constructor
   * @param {string} path
   * @param {Object=} state
   * @api public
   */

  function Context(path, state) {
    if ('/' === path[0] && 0 !== path.indexOf(base)) path = base + (hashbang ? '#!' : '') + path;
    var i = path.indexOf('?');

    this.canonicalPath = path;
    this.path = path.replace(base, '') || '/';
    if (hashbang) this.path = this.path.replace('#!', '') || '/';

    this.title = document.title;
    this.state = state || {};
    this.state.path = path;
    this.querystring = ~i ? decodeURLEncodedURIComponent(path.slice(i + 1)) : '';
    this.pathname = decodeURLEncodedURIComponent(~i ? path.slice(0, i) : path);
    this.params = {};

    // fragment
    this.hash = '';
    if (!hashbang) {
      if (!~this.path.indexOf('#')) return;
      var parts = this.path.split('#');
      this.path = parts[0];
      this.hash = decodeURLEncodedURIComponent(parts[1]) || '';
      this.querystring = this.querystring.split('#')[0];
    }
  }

  /**
   * Expose `Context`.
   */

  page.Context = Context;

  /**
   * Push state.
   *
   * @api private
   */

  Context.prototype.pushState = function() {
    page.len++;
    history.pushState(this.state, this.title, hashbang && this.path !== '/' ? '#!' + this.path : this.canonicalPath);
  };

  /**
   * Save the context state.
   *
   * @api public
   */

  Context.prototype.save = function() {
    history.replaceState(this.state, this.title, hashbang && this.path !== '/' ? '#!' + this.path : this.canonicalPath);
  };

  /**
   * Initialize `Route` with the given HTTP `path`,
   * and an array of `callbacks` and `options`.
   *
   * Options:
   *
   *   - `sensitive`    enable case-sensitive routes
   *   - `strict`       enable strict matching for trailing slashes
   *
   * @constructor
   * @param {string} path
   * @param {Object=} options
   * @api private
   */

  function Route(path, options) {
    options = options || {};
    this.path = (path === '*') ? '(.*)' : path;
    this.method = 'GET';
    this.regexp = pathtoRegexp(this.path,
      this.keys = [],
      options);
  }

  /**
   * Expose `Route`.
   */

  page.Route = Route;

  /**
   * Return route middleware with
   * the given callback `fn()`.
   *
   * @param {Function} fn
   * @return {Function}
   * @api public
   */

  Route.prototype.middleware = function(fn) {
    var self = this;
    return function(ctx, next) {
      if (self.match(ctx.path, ctx.params)) return fn(ctx, next);
      next();
    };
  };

  /**
   * Check if this route matches `path`, if so
   * populate `params`.
   *
   * @param {string} path
   * @param {Object} params
   * @return {boolean}
   * @api private
   */

  Route.prototype.match = function(path, params) {
    var keys = this.keys,
      qsIndex = path.indexOf('?'),
      pathname = ~qsIndex ? path.slice(0, qsIndex) : path,
      m = this.regexp.exec(decodeURIComponent(pathname));

    if (!m) return false;

    for (var i = 1, len = m.length; i < len; ++i) {
      var key = keys[i - 1];
      var val = decodeURLEncodedURIComponent(m[i]);
      if (val !== undefined || !(hasOwnProperty.call(params, key.name))) {
        params[key.name] = val;
      }
    }

    return true;
  };


  /**
   * Handle "populate" events.
   */

  var onpopstate = (function () {
    var loaded = false;
    if ('undefined' === typeof window) {
      return;
    }
    if (document.readyState === 'complete') {
      loaded = true;
    } else {
      window.addEventListener('load', function() {
        setTimeout(function() {
          loaded = true;
        }, 0);
      });
    }
    return function onpopstate(e) {
      if (!loaded) return;
      if (e.state) {
        var path = e.state.path;
        page.replace(path, e.state);
      } else {
        page.show(location.pathname + location.hash, undefined, undefined, false);
      }
    };
  })();
  /**
   * Handle "click" events.
   */

  function onclick(e) {

    if (1 !== which(e)) return;

    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (e.defaultPrevented) return;



    // ensure link
    // use shadow dom when available
    var el = e.path ? e.path[0] : e.target;
    while (el && 'A' !== el.nodeName) el = el.parentNode;
    if (!el || 'A' !== el.nodeName) return;



    // Ignore if tag has
    // 1. "download" attribute
    // 2. rel="external" attribute
    if (el.hasAttribute('download') || el.getAttribute('rel') === 'external') return;

    // ensure non-hash for the same path
    var link = el.getAttribute('href');
    if (!hashbang && el.pathname === location.pathname && (el.hash || '#' === link)) return;



    // Check for mailto: in the href
    if (link && link.indexOf('mailto:') > -1) return;

    // check target
    if (el.target) return;

    // x-origin
    if (!sameOrigin(el.href)) return;



    // rebuild path
    var path = el.pathname + el.search + (el.hash || '');

    // strip leading "/[drive letter]:" on NW.js on Windows
    if (typeof process !== 'undefined' && path.match(/^\/[a-zA-Z]:\//)) {
      path = path.replace(/^\/[a-zA-Z]:\//, '/');
    }

    // same page
    var orig = path;

    if (path.indexOf(base) === 0) {
      path = path.substr(base.length);
    }

    if (hashbang) path = path.replace('#!', '');

    if (base && orig === path) return;

    e.preventDefault();
    page.show(orig);
  }

  /**
   * Event button.
   */

  function which(e) {
    e = e || window.event;
    return null === e.which ? e.button : e.which;
  }

  /**
   * Check if `href` is the same origin.
   */

  function sameOrigin(href) {
    var origin = location.protocol + '//' + location.hostname;
    if (location.port) origin += ':' + location.port;
    return (href && (0 === href.indexOf(origin)));
  }

  page.sameOrigin = sameOrigin;

}).call(this,require('_process'))
},{"_process":2,"path-to-regexp":3}],2:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canMutationObserver = typeof window !== 'undefined'
    && window.MutationObserver;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    var queue = [];

    if (canMutationObserver) {
        var hiddenDiv = document.createElement("div");
        var observer = new MutationObserver(function () {
            var queueList = queue.slice();
            queue.length = 0;
            queueList.forEach(function (fn) {
                fn();
            });
        });

        observer.observe(hiddenDiv, { attributes: true });

        return function nextTick(fn) {
            if (!queue.length) {
                hiddenDiv.setAttribute('yes', 'no');
            }
            queue.push(fn);
        };
    }

    if (canPost) {
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],3:[function(require,module,exports){
var isarray = require('isarray')

/**
 * Expose `pathToRegexp`.
 */
module.exports = pathToRegexp
module.exports.parse = parse
module.exports.compile = compile
module.exports.tokensToFunction = tokensToFunction
module.exports.tokensToRegExp = tokensToRegExp

/**
 * The main path matching regexp utility.
 *
 * @type {RegExp}
 */
var PATH_REGEXP = new RegExp([
  // Match escaped characters that would otherwise appear in future matches.
  // This allows the user to escape special characters that won't transform.
  '(\\\\.)',
  // Match Express-style parameters and un-named parameters with a prefix
  // and optional suffixes. Matches appear as:
  //
  // "/:test(\\d+)?" => ["/", "test", "\d+", undefined, "?", undefined]
  // "/route(\\d+)"  => [undefined, undefined, undefined, "\d+", undefined, undefined]
  // "/*"            => ["/", undefined, undefined, undefined, undefined, "*"]
  '([\\/.])?(?:(?:\\:(\\w+)(?:\\(((?:\\\\.|[^()])+)\\))?|\\(((?:\\\\.|[^()])+)\\))([+*?])?|(\\*))'
].join('|'), 'g')

/**
 * Parse a string for the raw tokens.
 *
 * @param  {String} str
 * @return {Array}
 */
function parse (str) {
  var tokens = []
  var key = 0
  var index = 0
  var path = ''
  var res

  while ((res = PATH_REGEXP.exec(str)) != null) {
    var m = res[0]
    var escaped = res[1]
    var offset = res.index
    path += str.slice(index, offset)
    index = offset + m.length

    // Ignore already escaped sequences.
    if (escaped) {
      path += escaped[1]
      continue
    }

    // Push the current path onto the tokens.
    if (path) {
      tokens.push(path)
      path = ''
    }

    var prefix = res[2]
    var name = res[3]
    var capture = res[4]
    var group = res[5]
    var suffix = res[6]
    var asterisk = res[7]

    var repeat = suffix === '+' || suffix === '*'
    var optional = suffix === '?' || suffix === '*'
    var delimiter = prefix || '/'
    var pattern = capture || group || (asterisk ? '.*' : '[^' + delimiter + ']+?')

    tokens.push({
      name: name || key++,
      prefix: prefix || '',
      delimiter: delimiter,
      optional: optional,
      repeat: repeat,
      pattern: escapeGroup(pattern)
    })
  }

  // Match any characters still remaining.
  if (index < str.length) {
    path += str.substr(index)
  }

  // If the path exists, push it onto the end.
  if (path) {
    tokens.push(path)
  }

  return tokens
}

/**
 * Compile a string to a template function for the path.
 *
 * @param  {String}   str
 * @return {Function}
 */
function compile (str) {
  return tokensToFunction(parse(str))
}

/**
 * Expose a method for transforming tokens into the path function.
 */
function tokensToFunction (tokens) {
  // Compile all the tokens into regexps.
  var matches = new Array(tokens.length)

  // Compile all the patterns before compilation.
  for (var i = 0; i < tokens.length; i++) {
    if (typeof tokens[i] === 'object') {
      matches[i] = new RegExp('^' + tokens[i].pattern + '$')
    }
  }

  return function (obj) {
    var path = ''
    var data = obj || {}

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i]

      if (typeof token === 'string') {
        path += token

        continue
      }

      var value = data[token.name]
      var segment

      if (value == null) {
        if (token.optional) {
          continue
        } else {
          throw new TypeError('Expected "' + token.name + '" to be defined')
        }
      }

      if (isarray(value)) {
        if (!token.repeat) {
          throw new TypeError('Expected "' + token.name + '" to not repeat, but received "' + value + '"')
        }

        if (value.length === 0) {
          if (token.optional) {
            continue
          } else {
            throw new TypeError('Expected "' + token.name + '" to not be empty')
          }
        }

        for (var j = 0; j < value.length; j++) {
          segment = encodeURIComponent(value[j])

          if (!matches[i].test(segment)) {
            throw new TypeError('Expected all "' + token.name + '" to match "' + token.pattern + '", but received "' + segment + '"')
          }

          path += (j === 0 ? token.prefix : token.delimiter) + segment
        }

        continue
      }

      segment = encodeURIComponent(value)

      if (!matches[i].test(segment)) {
        throw new TypeError('Expected "' + token.name + '" to match "' + token.pattern + '", but received "' + segment + '"')
      }

      path += token.prefix + segment
    }

    return path
  }
}

/**
 * Escape a regular expression string.
 *
 * @param  {String} str
 * @return {String}
 */
function escapeString (str) {
  return str.replace(/([.+*?=^!:${}()[\]|\/])/g, '\\$1')
}

/**
 * Escape the capturing group by escaping special characters and meaning.
 *
 * @param  {String} group
 * @return {String}
 */
function escapeGroup (group) {
  return group.replace(/([=!:$\/()])/g, '\\$1')
}

/**
 * Attach the keys as a property of the regexp.
 *
 * @param  {RegExp} re
 * @param  {Array}  keys
 * @return {RegExp}
 */
function attachKeys (re, keys) {
  re.keys = keys
  return re
}

/**
 * Get the flags for a regexp from the options.
 *
 * @param  {Object} options
 * @return {String}
 */
function flags (options) {
  return options.sensitive ? '' : 'i'
}

/**
 * Pull out keys from a regexp.
 *
 * @param  {RegExp} path
 * @param  {Array}  keys
 * @return {RegExp}
 */
function regexpToRegexp (path, keys) {
  // Use a negative lookahead to match only capturing groups.
  var groups = path.source.match(/\((?!\?)/g)

  if (groups) {
    for (var i = 0; i < groups.length; i++) {
      keys.push({
        name: i,
        prefix: null,
        delimiter: null,
        optional: false,
        repeat: false,
        pattern: null
      })
    }
  }

  return attachKeys(path, keys)
}

/**
 * Transform an array into a regexp.
 *
 * @param  {Array}  path
 * @param  {Array}  keys
 * @param  {Object} options
 * @return {RegExp}
 */
function arrayToRegexp (path, keys, options) {
  var parts = []

  for (var i = 0; i < path.length; i++) {
    parts.push(pathToRegexp(path[i], keys, options).source)
  }

  var regexp = new RegExp('(?:' + parts.join('|') + ')', flags(options))

  return attachKeys(regexp, keys)
}

/**
 * Create a path regexp from string input.
 *
 * @param  {String} path
 * @param  {Array}  keys
 * @param  {Object} options
 * @return {RegExp}
 */
function stringToRegexp (path, keys, options) {
  var tokens = parse(path)
  var re = tokensToRegExp(tokens, options)

  // Attach keys back to the regexp.
  for (var i = 0; i < tokens.length; i++) {
    if (typeof tokens[i] !== 'string') {
      keys.push(tokens[i])
    }
  }

  return attachKeys(re, keys)
}

/**
 * Expose a function for taking tokens and returning a RegExp.
 *
 * @param  {Array}  tokens
 * @param  {Array}  keys
 * @param  {Object} options
 * @return {RegExp}
 */
function tokensToRegExp (tokens, options) {
  options = options || {}

  var strict = options.strict
  var end = options.end !== false
  var route = ''
  var lastToken = tokens[tokens.length - 1]
  var endsWithSlash = typeof lastToken === 'string' && /\/$/.test(lastToken)

  // Iterate over the tokens and create our regexp string.
  for (var i = 0; i < tokens.length; i++) {
    var token = tokens[i]

    if (typeof token === 'string') {
      route += escapeString(token)
    } else {
      var prefix = escapeString(token.prefix)
      var capture = token.pattern

      if (token.repeat) {
        capture += '(?:' + prefix + capture + ')*'
      }

      if (token.optional) {
        if (prefix) {
          capture = '(?:' + prefix + '(' + capture + '))?'
        } else {
          capture = '(' + capture + ')?'
        }
      } else {
        capture = prefix + '(' + capture + ')'
      }

      route += capture
    }
  }

  // In non-strict mode we allow a slash at the end of match. If the path to
  // match already ends with a slash, we remove it for consistency. The slash
  // is valid at the end of a path match, not in the middle. This is important
  // in non-ending mode, where "/test/" shouldn't match "/test//route".
  if (!strict) {
    route = (endsWithSlash ? route.slice(0, -2) : route) + '(?:\\/(?=$))?'
  }

  if (end) {
    route += '$'
  } else {
    // In non-ending mode, we need the capturing groups to match as much as
    // possible by using a positive lookahead to the end or next path segment.
    route += strict && endsWithSlash ? '' : '(?=\\/|$)'
  }

  return new RegExp('^' + route, flags(options))
}

/**
 * Normalize the given path string, returning a regular expression.
 *
 * An empty array can be passed in for the keys, which will hold the
 * placeholder key descriptions. For example, using `/user/:id`, `keys` will
 * contain `[{ name: 'id', delimiter: '/', optional: false, repeat: false }]`.
 *
 * @param  {(String|RegExp|Array)} path
 * @param  {Array}                 [keys]
 * @param  {Object}                [options]
 * @return {RegExp}
 */
function pathToRegexp (path, keys, options) {
  keys = keys || []

  if (!isarray(keys)) {
    options = keys
    keys = []
  } else if (!options) {
    options = {}
  }

  if (path instanceof RegExp) {
    return regexpToRegexp(path, keys, options)
  }

  if (isarray(path)) {
    return arrayToRegexp(path, keys, options)
  }

  return stringToRegexp(path, keys, options)
}

},{"isarray":4}],4:[function(require,module,exports){
module.exports = Array.isArray || function (arr) {
  return Object.prototype.toString.call(arr) == '[object Array]';
};

},{}]},{},[1])(1)
});
/*!
 * EventEmitter v5.0.0 - git.io/ee
 * Unlicense - http://unlicense.org/
 * Oliver Caldwell - http://oli.me.uk/
 * @preserve
 */

;(function () {
    'use strict';

    /**
     * Class for managing events.
     * Can be extended to provide event functionality in other classes.
     *
     * @class EventEmitter Manages event registering and emitting.
     */
    function EventEmitter() {}

    // Shortcuts to improve speed and size
    var proto = EventEmitter.prototype;
    var exports = this;
    var originalGlobalValue = exports.EventEmitter;

    /**
     * Finds the index of the listener for the event in its storage array.
     *
     * @param {Function[]} listeners Array of listeners to search through.
     * @param {Function} listener Method to look for.
     * @return {Number} Index of the specified listener, -1 if not found
     * @api private
     */
    function indexOfListener(listeners, listener) {
        var i = listeners.length;
        while (i--) {
            if (listeners[i].listener === listener) {
                return i;
            }
        }

        return -1;
    }

    /**
     * Alias a method while keeping the context correct, to allow for overwriting of target method.
     *
     * @param {String} name The name of the target method.
     * @return {Function} The aliased method
     * @api private
     */
    function alias(name) {
        return function aliasClosure() {
            return this[name].apply(this, arguments);
        };
    }

    /**
     * Returns the listener array for the specified event.
     * Will initialise the event object and listener arrays if required.
     * Will return an object if you use a regex search. The object contains keys for each matched event. So /ba[rz]/ might return an object containing bar and baz. But only if you have either defined them with defineEvent or added some listeners to them.
     * Each property in the object response is an array of listener functions.
     *
     * @param {String|RegExp} evt Name of the event to return the listeners from.
     * @return {Function[]|Object} All listener functions for the event.
     */
    proto.getListeners = function getListeners(evt) {
        var events = this._getEvents();
        var response;
        var key;

        // Return a concatenated array of all matching events if
        // the selector is a regular expression.
        if (evt instanceof RegExp) {
            response = {};
            for (key in events) {
                if (events.hasOwnProperty(key) && evt.test(key)) {
                    response[key] = events[key];
                }
            }
        }
        else {
            response = events[evt] || (events[evt] = []);
        }

        return response;
    };

    /**
     * Takes a list of listener objects and flattens it into a list of listener functions.
     *
     * @param {Object[]} listeners Raw listener objects.
     * @return {Function[]} Just the listener functions.
     */
    proto.flattenListeners = function flattenListeners(listeners) {
        var flatListeners = [];
        var i;

        for (i = 0; i < listeners.length; i += 1) {
            flatListeners.push(listeners[i].listener);
        }

        return flatListeners;
    };

    /**
     * Fetches the requested listeners via getListeners but will always return the results inside an object. This is mainly for internal use but others may find it useful.
     *
     * @param {String|RegExp} evt Name of the event to return the listeners from.
     * @return {Object} All listener functions for an event in an object.
     */
    proto.getListenersAsObject = function getListenersAsObject(evt) {
        var listeners = this.getListeners(evt);
        var response;

        if (listeners instanceof Array) {
            response = {};
            response[evt] = listeners;
        }

        return response || listeners;
    };

    /**
     * Adds a listener function to the specified event.
     * The listener will not be added if it is a duplicate.
     * If the listener returns true then it will be removed after it is called.
     * If you pass a regular expression as the event name then the listener will be added to all events that match it.
     *
     * @param {String|RegExp} evt Name of the event to attach the listener to.
     * @param {Function} listener Method to be called when the event is emitted. If the function returns true then it will be removed after calling.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.addListener = function addListener(evt, listener) {
        var listeners = this.getListenersAsObject(evt);
        var listenerIsWrapped = typeof listener === 'object';
        var key;

        for (key in listeners) {
            if (listeners.hasOwnProperty(key) && indexOfListener(listeners[key], listener) === -1) {
                listeners[key].push(listenerIsWrapped ? listener : {
                    listener: listener,
                    once: false
                });
            }
        }

        return this;
    };

    /**
     * Alias of addListener
     */
    proto.on = alias('addListener');

    /**
     * Semi-alias of addListener. It will add a listener that will be
     * automatically removed after its first execution.
     *
     * @param {String|RegExp} evt Name of the event to attach the listener to.
     * @param {Function} listener Method to be called when the event is emitted. If the function returns true then it will be removed after calling.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.addOnceListener = function addOnceListener(evt, listener) {
        return this.addListener(evt, {
            listener: listener,
            once: true
        });
    };

    /**
     * Alias of addOnceListener.
     */
    proto.once = alias('addOnceListener');

    /**
     * Defines an event name. This is required if you want to use a regex to add a listener to multiple events at once. If you don't do this then how do you expect it to know what event to add to? Should it just add to every possible match for a regex? No. That is scary and bad.
     * You need to tell it what event names should be matched by a regex.
     *
     * @param {String} evt Name of the event to create.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.defineEvent = function defineEvent(evt) {
        this.getListeners(evt);
        return this;
    };

    /**
     * Uses defineEvent to define multiple events.
     *
     * @param {String[]} evts An array of event names to define.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.defineEvents = function defineEvents(evts) {
        for (var i = 0; i < evts.length; i += 1) {
            this.defineEvent(evts[i]);
        }
        return this;
    };

    /**
     * Removes a listener function from the specified event.
     * When passed a regular expression as the event name, it will remove the listener from all events that match it.
     *
     * @param {String|RegExp} evt Name of the event to remove the listener from.
     * @param {Function} listener Method to remove from the event.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.removeListener = function removeListener(evt, listener) {
        var listeners = this.getListenersAsObject(evt);
        var index;
        var key;

        for (key in listeners) {
            if (listeners.hasOwnProperty(key)) {
                index = indexOfListener(listeners[key], listener);

                if (index !== -1) {
                    listeners[key].splice(index, 1);
                }
            }
        }

        return this;
    };

    /**
     * Alias of removeListener
     */
    proto.off = alias('removeListener');

    /**
     * Adds listeners in bulk using the manipulateListeners method.
     * If you pass an object as the second argument you can add to multiple events at once. The object should contain key value pairs of events and listeners or listener arrays. You can also pass it an event name and an array of listeners to be added.
     * You can also pass it a regular expression to add the array of listeners to all events that match it.
     * Yeah, this function does quite a bit. That's probably a bad thing.
     *
     * @param {String|Object|RegExp} evt An event name if you will pass an array of listeners next. An object if you wish to add to multiple events at once.
     * @param {Function[]} [listeners] An optional array of listener functions to add.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.addListeners = function addListeners(evt, listeners) {
        // Pass through to manipulateListeners
        return this.manipulateListeners(false, evt, listeners);
    };

    /**
     * Removes listeners in bulk using the manipulateListeners method.
     * If you pass an object as the second argument you can remove from multiple events at once. The object should contain key value pairs of events and listeners or listener arrays.
     * You can also pass it an event name and an array of listeners to be removed.
     * You can also pass it a regular expression to remove the listeners from all events that match it.
     *
     * @param {String|Object|RegExp} evt An event name if you will pass an array of listeners next. An object if you wish to remove from multiple events at once.
     * @param {Function[]} [listeners] An optional array of listener functions to remove.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.removeListeners = function removeListeners(evt, listeners) {
        // Pass through to manipulateListeners
        return this.manipulateListeners(true, evt, listeners);
    };

    /**
     * Edits listeners in bulk. The addListeners and removeListeners methods both use this to do their job. You should really use those instead, this is a little lower level.
     * The first argument will determine if the listeners are removed (true) or added (false).
     * If you pass an object as the second argument you can add/remove from multiple events at once. The object should contain key value pairs of events and listeners or listener arrays.
     * You can also pass it an event name and an array of listeners to be added/removed.
     * You can also pass it a regular expression to manipulate the listeners of all events that match it.
     *
     * @param {Boolean} remove True if you want to remove listeners, false if you want to add.
     * @param {String|Object|RegExp} evt An event name if you will pass an array of listeners next. An object if you wish to add/remove from multiple events at once.
     * @param {Function[]} [listeners] An optional array of listener functions to add/remove.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.manipulateListeners = function manipulateListeners(remove, evt, listeners) {
        var i;
        var value;
        var single = remove ? this.removeListener : this.addListener;
        var multiple = remove ? this.removeListeners : this.addListeners;

        // If evt is an object then pass each of its properties to this method
        if (typeof evt === 'object' && !(evt instanceof RegExp)) {
            for (i in evt) {
                if (evt.hasOwnProperty(i) && (value = evt[i])) {
                    // Pass the single listener straight through to the singular method
                    if (typeof value === 'function') {
                        single.call(this, i, value);
                    }
                    else {
                        // Otherwise pass back to the multiple function
                        multiple.call(this, i, value);
                    }
                }
            }
        }
        else {
            // So evt must be a string
            // And listeners must be an array of listeners
            // Loop over it and pass each one to the multiple method
            i = listeners.length;
            while (i--) {
                single.call(this, evt, listeners[i]);
            }
        }

        return this;
    };

    /**
     * Removes all listeners from a specified event.
     * If you do not specify an event then all listeners will be removed.
     * That means every event will be emptied.
     * You can also pass a regex to remove all events that match it.
     *
     * @param {String|RegExp} [evt] Optional name of the event to remove all listeners for. Will remove from every event if not passed.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.removeEvent = function removeEvent(evt) {
        var type = typeof evt;
        var events = this._getEvents();
        var key;

        // Remove different things depending on the state of evt
        if (type === 'string') {
            // Remove all listeners for the specified event
            delete events[evt];
        }
        else if (evt instanceof RegExp) {
            // Remove all events matching the regex.
            for (key in events) {
                if (events.hasOwnProperty(key) && evt.test(key)) {
                    delete events[key];
                }
            }
        }
        else {
            // Remove all listeners in all events
            delete this._events;
        }

        return this;
    };

    /**
     * Alias of removeEvent.
     *
     * Added to mirror the node API.
     */
    proto.removeAllListeners = alias('removeEvent');

    /**
     * Emits an event of your choice.
     * When emitted, every listener attached to that event will be executed.
     * If you pass the optional argument array then those arguments will be passed to every listener upon execution.
     * Because it uses `apply`, your array of arguments will be passed as if you wrote them out separately.
     * So they will not arrive within the array on the other side, they will be separate.
     * You can also pass a regular expression to emit to all events that match it.
     *
     * @param {String|RegExp} evt Name of the event to emit and execute listeners for.
     * @param {Array} [args] Optional array of arguments to be passed to each listener.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.emitEvent = function emitEvent(evt, args) {
        var listenersMap = this.getListenersAsObject(evt);
        var listeners;
        var listener;
        var i;
        var key;
        var response;

        for (key in listenersMap) {
            if (listenersMap.hasOwnProperty(key)) {
                listeners = listenersMap[key].slice(0);

                for (i = 0; i < listeners.length; i++) {
                    // If the listener returns true then it shall be removed from the event
                    // The function is executed either with a basic call or an apply if there is an args array
                    listener = listeners[i];

                    if (listener.once === true) {
                        this.removeListener(evt, listener.listener);
                    }

                    response = listener.listener.apply(this, args || []);

                    if (response === this._getOnceReturnValue()) {
                        this.removeListener(evt, listener.listener);
                    }
                }
            }
        }

        return this;
    };

    /**
     * Alias of emitEvent
     */
    proto.trigger = alias('emitEvent');

    /**
     * Subtly different from emitEvent in that it will pass its arguments on to the listeners, as opposed to taking a single array of arguments to pass on.
     * As with emitEvent, you can pass a regex in place of the event name to emit to all events that match it.
     *
     * @param {String|RegExp} evt Name of the event to emit and execute listeners for.
     * @param {...*} Optional additional arguments to be passed to each listener.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.emit = function emit(evt) {
        var args = Array.prototype.slice.call(arguments, 1);
        return this.emitEvent(evt, args);
    };

    /**
     * Sets the current value to check against when executing listeners. If a
     * listeners return value matches the one set here then it will be removed
     * after execution. This value defaults to true.
     *
     * @param {*} value The new value to check for when executing listeners.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.setOnceReturnValue = function setOnceReturnValue(value) {
        this._onceReturnValue = value;
        return this;
    };

    /**
     * Fetches the current value to check against when executing listeners. If
     * the listeners return value matches this one then it should be removed
     * automatically. It will return true by default.
     *
     * @return {*|Boolean} The current value to check for or the default, true.
     * @api private
     */
    proto._getOnceReturnValue = function _getOnceReturnValue() {
        if (this.hasOwnProperty('_onceReturnValue')) {
            return this._onceReturnValue;
        }
        else {
            return true;
        }
    };

    /**
     * Fetches the events object and creates one if required.
     *
     * @return {Object} The events storage object.
     * @api private
     */
    proto._getEvents = function _getEvents() {
        return this._events || (this._events = {});
    };

    /**
     * Reverts the global {@link EventEmitter} to its previous value and returns a reference to this version.
     *
     * @return {Function} Non conflicting EventEmitter class.
     */
    EventEmitter.noConflict = function noConflict() {
        exports.EventEmitter = originalGlobalValue;
        return EventEmitter;
    };

    // Expose the class either via AMD, CommonJS or the global object
    if (typeof define === 'function' && define.amd) {
        define(function () {
            return EventEmitter;
        });
    }
    else if (typeof module === 'object' && module.exports){
        module.exports = EventEmitter;
    }
    else {
        exports.EventEmitter = EventEmitter;
    }
}.call(this));

/* docma (dust) compiled templates */
(function(dust){dust.register("docma-404",body_0);function body_0(chk,ctx){return chk.p("navbar",ctx,ctx,{"boxed":"true"}).w("<div id=\"page-content-wrapper\"><div class=\"container container-boxed\"><div class=\"row\"><div class=\"col-md-12\"><br /><br /><h1>404</h1><hr /><h3>Page Not Found</h3><br />The file or page you have requested is not found. &nbsp;&nbsp;<br />Please make sure page address is entered correctly.</div></div><br /><br /><br /></div></div>");}body_0.__dustBody=!0;return body_0}(dust));
(function(dust){dust.register("docma-api",body_0);function body_0(chk,ctx){return chk.p("navbar",ctx,ctx,{}).x(ctx.getPath(false, ["template","options","sidebar"]),ctx,{"block":body_1},{}).w("<div id=\"wrapper\">").x(ctx.getPath(false, ["template","options","sidebar"]),ctx,{"block":body_2},{}).w("<div id=\"page-content-wrapper\"><div class=\"container-fluid\"><div class=\"row\"><div class=\"col-lg-12\">").s(ctx.get(["documentation"], false),ctx,{"block":body_3},{}).w("</div></div><br />Copyright &copy; 2017 Nicolas Ramz (<a href=\"https://github.com/warpdesign\">@warpdesign</a>)<br /><br /><span class=\"docma-info\">Documentation built with <b><a target=\"_blank\" href=\"https://github.com/onury/docma\">Docma</a></b>.</span></div></div></div>");}body_0.__dustBody=!0;function body_1(chk,ctx){return chk.w("<div class=\"sidebar-toggle\"><span class=\"glyphicon glyphicon-menu-hamburger\"></span></div>");}body_1.__dustBody=!0;function body_2(chk,ctx){return chk.w("<div id=\"sidebar-wrapper\">").p("sidebar",ctx,ctx,{}).w("</div>");}body_2.__dustBody=!0;function body_3(chk,ctx){return chk.p("symbol",ctx,ctx,{"symbol":ctx.getPath(true, []),"template":ctx.get(["template"], false)});}body_3.__dustBody=!0;return body_0}(dust));
(function(dust){dust.register("docma-content",body_0);function body_0(chk,ctx){return chk.p("navbar",ctx,ctx,{"boxed":"true"}).w("<div id=\"page-content-wrapper\" class=\"static\"><div class=\"container container-boxed\"><div class=\"row\"><div class=\"col-md-12\"><div id=\"docma-content\"></div></div></div><br /><hr />Copyright &copy; 2017 Nicolas Ramz (<a href=\"https://github.com/warpdesign\">@warpdesign</a>)<br /><br /><span class=\"docma-info\">Documentation built with <b><a target=\"_blank\" href=\"https://github.com/onury/docma\">Docma</a></b>.</span></div></div>");}body_0.__dustBody=!0;return body_0}(dust));
(function(dust){dust.register("enums",body_0);function body_0(chk,ctx){return chk.x(ctx.get(["$members"], false),ctx,{"block":body_1},{});}body_0.__dustBody=!0;function body_1(chk,ctx){return chk.w("<table class=\"table table-striped table-bordered\"><thead><tr><th>Enumeration</th><th>Type</th><th>Value</th><th>Description</th></tr></thead><tbody>").s(ctx.get(["$members"], false),ctx,{"block":body_2},{}).w("</tbody></table>");}body_1.__dustBody=!0;function body_2(chk,ctx){return chk.w("<tr><td><code>").f(ctx.getPath(true, []),ctx,"h",["$longname","s","$dot_prop"]).w("</code></td><td><code>").f(ctx.getPath(true, []),ctx,"h",["$type"]).w("</code></td><td><code>").f(ctx.getPath(true, []),ctx,"h",["$val"]).w("</code></td><td>").f(ctx.getPath(true, []),ctx,"h",["s","$desc"]).w("</td></tr>");}body_2.__dustBody=!0;return body_0}(dust));
(function(dust){dust.register("navbar",body_0);function body_0(chk,ctx){return chk.x(ctx.getPath(false, ["template","options","navbar"]),ctx,{"block":body_1},{});}body_0.__dustBody=!0;function body_1(chk,ctx){return chk.w("<nav class=\"navbar navbar-default navbar-fixed-top\"><div class=\"").x(ctx.get(["boxed"], false),ctx,{"else":body_2,"block":body_3},{}).w("\"><div class=\"nav navbar-left nav-left\"><div class=\"navbar-brand\"><b>").f(ctx.getPath(false, ["template","options","title"]),ctx,"h").w("</b></div></div>").h("gt",ctx,{"block":body_4},{"key":ctx.getPath(false, ["template","options","navItems","length"]),"value":0},"h").w("</div></nav>");}body_1.__dustBody=!0;function body_2(chk,ctx){return chk.w("container-fluid");}body_2.__dustBody=!0;function body_3(chk,ctx){return chk.w("container container-boxed");}body_3.__dustBody=!0;function body_4(chk,ctx){return chk.w("<ul class=\"nav navbar-nav\">").s(ctx.getPath(false, ["template","options","navItems"]),ctx,{"block":body_5},{}).w("</ul>");}body_4.__dustBody=!0;function body_5(chk,ctx){return chk.x(ctx.get(["items"], false),ctx,{"else":body_6,"block":body_7},{});}body_5.__dustBody=!0;function body_6(chk,ctx){return chk.p("navitem",ctx,ctx.rebase(ctx.getPath(true, [])),{});}body_6.__dustBody=!0;function body_7(chk,ctx){return chk.w("<li class=\"dropdown\"><a href=\"").x(ctx.get(["href"], false),ctx,{"else":body_8,"block":body_9},{}).w("\" class=\"dropdown-toggle\" data-toggle=\"dropdown\" role=\"button\" aria-haspopup=\"true\" aria-expanded=\"false\"><i class=\"ico ").f(ctx.get(["iconClass"], false),ctx,"h").w("\" aria-hidden=\"true\"></i>&nbsp;&nbsp;").f(ctx.get(["label"], false),ctx,"h").w("&nbsp;<span class=\"caret\"></span></a><ul class=\"dropdown-menu\">").s(ctx.get(["items"], false),ctx,{"block":body_10},{}).w("</ul></li>");}body_7.__dustBody=!0;function body_8(chk,ctx){return chk.w("#");}body_8.__dustBody=!0;function body_9(chk,ctx){return chk.f(ctx.get(["href"], false),ctx,"h");}body_9.__dustBody=!0;function body_10(chk,ctx){return chk.p("navitem",ctx,ctx.rebase(ctx.getPath(true, [])),{});}body_10.__dustBody=!0;return body_0}(dust));
(function(dust){dust.register("navitem",body_0);function body_0(chk,ctx){return chk.x(ctx.get(["separator"], false),ctx,{"else":body_1,"block":body_5},{});}body_0.__dustBody=!0;function body_1(chk,ctx){return chk.w("<li><a href=\"").x(ctx.get(["href"], false),ctx,{"else":body_2,"block":body_3},{}).w("\" target=\"").f(ctx.get(["target"], false),ctx,"h").w("\">").x(ctx.get(["iconClass"], false),ctx,{"block":body_4},{}).f(ctx.get(["label"], false),ctx,"h",["s"]).w("</a></li>");}body_1.__dustBody=!0;function body_2(chk,ctx){return chk.w("#");}body_2.__dustBody=!0;function body_3(chk,ctx){return chk.f(ctx.get(["href"], false),ctx,"h");}body_3.__dustBody=!0;function body_4(chk,ctx){return chk.w("<i class=\"ico ").f(ctx.get(["iconClass"], false),ctx,"h").w("\" aria-hidden=\"true\"></i>&nbsp;&nbsp;");}body_4.__dustBody=!0;function body_5(chk,ctx){return chk.w("<li role=\"separator\" class=\"divider\"></li>");}body_5.__dustBody=!0;return body_0}(dust));
(function(dust){dust.register("params",body_0);function body_0(chk,ctx){return chk.x(ctx.get(["params"], false),ctx,{"block":body_1},{});}body_0.__dustBody=!0;function body_1(chk,ctx){return chk.w("<table class=\"table table-striped table-bordered\"><thead><tr><th>Param</th><th>Type</th><th>Default</th><th>Description</th></tr></thead><tbody>").s(ctx.get(["params"], false),ctx,{"block":body_2},{}).w("</tbody></table>");}body_1.__dustBody=!0;function body_2(chk,ctx){return chk.w("<tr><td>").f(ctx.get(["name"], false),ctx,"h",["s","$dot_prop"]).w("</td><td><span class=\"color-blue\">").f(ctx.getPath(true, []),ctx,"h",["$type","s","$get_type_link"]).w("</span></td><td>").x(ctx.get(["optional"], false),ctx,{"block":body_3},{}).w("</td><td>").x(ctx.get(["description"], false),ctx,{"block":body_4},{}).w("</td></tr>");}body_2.__dustBody=!0;function body_3(chk,ctx){return chk.f(ctx.getPath(true, []),ctx,"h",["$def"]);}body_3.__dustBody=!0;function body_4(chk,ctx){return chk.f(ctx.getPath(true, []),ctx,"h",["s","$param_desc"]);}body_4.__dustBody=!0;return body_0}(dust));
(function(dust){dust.register("properties",body_0);function body_0(chk,ctx){return chk.x(ctx.get(["properties"], false),ctx,{"block":body_1},{});}body_0.__dustBody=!0;function body_1(chk,ctx){return chk.w("<table class=\"table table-striped table-bordered\"><thead><tr><th>Property</th><th>Type</th><th>Description</th></tr></thead><tbody>").s(ctx.get(["properties"], false),ctx,{"block":body_2},{}).w("</tbody></table>");}body_1.__dustBody=!0;function body_2(chk,ctx){return chk.w("<tr><td><code>").f(ctx.get(["name"], false),ctx,"h",["s","$dot_prop"]).w("</code></td><td><code>").f(ctx.getPath(true, []),ctx,"h",["$type"]).w("</code></td><td>").f(ctx.get(["description"], false),ctx,"h",["s","$p"]).w("</td></tr>");}body_2.__dustBody=!0;return body_0}(dust));
(function(dust){dust.register("sidebar",body_0);function body_0(chk,ctx){return chk.w("<div class=\"sidebar-header\"><div class=\"sidebar-title\"><span><b>").f(ctx.getPath(false, ["template","options","title"]),ctx,"h").w("</b></span></div>").x(ctx.getPath(false, ["template","options","search"]),ctx,{"block":body_1},{}).w("</div><div class=\"sidebar-nav-container\"><ul class=\"sidebar-nav\">").s(ctx.get(["symbols"], false),ctx,{"block":body_2},{}).w("</ul><div class=\"sidebar-nav-space\"></div></div>");}body_0.__dustBody=!0;function body_1(chk,ctx){return chk.w("<div class=\"sidebar-search\"><input id=\"txt-search\" type=\"search\" class=\"form-control\" placeholder=\"Search...\" /><div class=\"sidebar-search-clean\"><span class=\"glyphicon glyphicon-remove-circle\"></span></div></div>");}body_1.__dustBody=!0;function body_2(chk,ctx){return chk.w("<li>").f(ctx.getPath(true, []),ctx,"h",["s","$menuitem"]).w("</li>");}body_2.__dustBody=!0;return body_0}(dust));
(function(dust){dust.register("symbol",body_0);function body_0(chk,ctx){return chk.w("<div id=\"").f(ctx.getPath(true, []),ctx,"h",["$id"]).w("\" class=\"symbol-container ").f(ctx.get(["symbol"], false),ctx,"h",["$get_type"]).w("\"><div class=\"symbol-heading\"><div class=\"symbol\"><a href=\"#").f(ctx.getPath(true, []),ctx,"h",["$id"]).w("\" data-ref-symbol=\"").f(ctx.get(["symbol"], false),ctx,"h",["$clean_ref"]).w("\"><span style=\"display:none;\" class=\"glyphicon glyphicon-link color-gray-light\" aria-hidden=\"true\"></span><span class=\"symbol-name\">").f(ctx.get(["symbol"], false),ctx,"h",["s","$longname_params"]).w("</span><span style=\"display:none;\" class=\"symbol-sep\">").f(ctx.get(["symbol"], false),ctx,"h",["$type_sep"]).w("</span><code style=\"display:none;\" class=\"symbol-type\">").f(ctx.get(["symbol"], false),ctx,"h",["$type"]).w("</code><span style=\"display:none;\" class=\"color-blue\">►</span></a>").f(ctx.get(["symbol"], false),ctx,"h",["s","$tags"]).w("</div>").x(ctx.getPath(false, ["symbol","augments"]),ctx,{"block":body_1},{}).x(ctx.getPath(false, ["symbol","alias"]),ctx,{"block":body_2},{}).x(ctx.getPath(false, ["template","options","symbolMeta"]),ctx,{"block":body_3},{}).w("        </div><div class=\"symbol-definition\">").x(ctx.getPath(false, ["symbol","classdesc"]),ctx,{"block":body_7},{}).f(ctx.get(["symbol"], false),ctx,"h",["s","$desc"]).x(ctx.getPath(false, ["symbol","see"]),ctx,{"block":body_12},{}).h("eq",ctx,{"else":body_17,"block":body_20},{"key":ctx.getPath(false, ["symbol","meta","code","type"]),"value":"ClassDeclaration"},"h").x(ctx.getPath(false, ["symbol","returns"]),ctx,{"block":body_21},{}).x(ctx.getPath(false, ["symbol","exceptions"]),ctx,{"block":body_24},{}).x(ctx.getPath(false, ["symbol","isEnum"]),ctx,{"block":body_27},{}).x(ctx.getPath(false, ["symbol","examples"]),ctx,{"block":body_28},{}).w("</div></div>").h("eq",ctx,{"block":body_30},{"key":ctx.getPath(false, ["symbol","meta","code","type"]),"value":"ClassDeclaration"},"h").x(ctx.getPath(false, ["symbol","isEnum"]),ctx,{"else":body_32,"block":body_34},{});}body_0.__dustBody=!0;function body_1(chk,ctx){return chk.w("<p class=\"space-left-sm\"><b>Extends:</b> ").f(ctx.get(["symbol"], false),ctx,"h",["s","$extends"]).w("</p>");}body_1.__dustBody=!0;function body_2(chk,ctx){return chk.w("<p class=\"space-left-sm\"><b>Alias:</b> <code>").f(ctx.getPath(false, ["symbol","alias"]),ctx,"h",["s","$dot_prop"]).w("</code></p>");}body_2.__dustBody=!0;function body_3(chk,ctx){return chk.x(ctx.getPath(false, ["symbol","meta","lineno"]),ctx,{"block":body_4},{});}body_3.__dustBody=!0;function body_4(chk,ctx){return chk.w("<p class=\"symbol-meta\">").x(ctx.getPath(false, ["symbol","meta","filename"]),ctx,{"block":body_5},{}).x(ctx.getPath(false, ["symbol","meta","lineno"]),ctx,{"block":body_6},{}).w("</p>");}body_4.__dustBody=!0;function body_5(chk,ctx){return chk.w("<b>File:</b> ").f(ctx.getPath(false, ["symbol","meta","filename"]),ctx,"h").w("&nbsp;&nbsp;");}body_5.__dustBody=!0;function body_6(chk,ctx){return chk.w("<b>Line:</b> ").f(ctx.getPath(false, ["symbol","meta","lineno"]),ctx,"h").w("&nbsp;&nbsp;");}body_6.__dustBody=!0;function body_7(chk,ctx){return chk.w("<table>").x(ctx.getPath(false, ["symbol","version"]),ctx,{"block":body_8},{}).x(ctx.getPath(false, ["symbol","copyright"]),ctx,{"block":body_9},{}).x(ctx.getPath(false, ["symbol","author"]),ctx,{"block":body_10},{}).x(ctx.getPath(false, ["symbol","license"]),ctx,{"block":body_11},{}).w("</table><br />");}body_7.__dustBody=!0;function body_8(chk,ctx){return chk.w("<tr><td><b>Version:</b>&nbsp;&nbsp;&nbsp;</td><td>").f(ctx.getPath(false, ["symbol","version"]),ctx,"h",["s"]).w("</td></tr>");}body_8.__dustBody=!0;function body_9(chk,ctx){return chk.w("<tr><td><b>Copyright:</b>&nbsp;&nbsp;&nbsp;</td><td>").f(ctx.getPath(false, ["symbol","copyright"]),ctx,"h",["s"]).w("</td></tr>");}body_9.__dustBody=!0;function body_10(chk,ctx){return chk.w("<tr><td><b>Author:</b>&nbsp;&nbsp;&nbsp;</td><td>").f(ctx.getPath(false, ["symbol","author"]),ctx,"h",["s","$author"]).w("</td></tr>");}body_10.__dustBody=!0;function body_11(chk,ctx){return chk.w("<tr><td><b>License:</b>&nbsp;&nbsp;&nbsp;</td><td>").f(ctx.getPath(false, ["symbol","license"]),ctx,"h",["s"]).w("</td></tr>");}body_11.__dustBody=!0;function body_12(chk,ctx){return chk.w("<p><b>See</b>").h("gt",ctx,{"else":body_13,"block":body_15},{"key":ctx.getPath(false, ["symbol","see","length"]),"value":1},"h").w("</p><br />");}body_12.__dustBody=!0;function body_13(chk,ctx){return chk.s(ctx.getPath(false, ["symbol","see"]),ctx,{"block":body_14},{});}body_13.__dustBody=!0;function body_14(chk,ctx){return chk.w("&nbsp;").f(ctx.getPath(true, []),ctx,"h",["s","$pl"]);}body_14.__dustBody=!0;function body_15(chk,ctx){return chk.w("<ul>").s(ctx.getPath(false, ["symbol","see"]),ctx,{"block":body_16},{}).w("</ul>");}body_15.__dustBody=!0;function body_16(chk,ctx){return chk.w("<li>").f(ctx.getPath(true, []),ctx,"h",["s","$pl"]).w("</li>");}body_16.__dustBody=!0;function body_17(chk,ctx){return chk.p("params",ctx,ctx.rebase(ctx.get(["symbol"], false)),{}).x(ctx.getPath(false, ["symbol","isEnum"]),ctx,{"else":body_18,"block":body_19},{});}body_17.__dustBody=!0;function body_18(chk,ctx){return chk.p("properties",ctx,ctx.rebase(ctx.get(["symbol"], false)),{});}body_18.__dustBody=!0;function body_19(chk,ctx){return chk;}body_19.__dustBody=!0;function body_20(chk,ctx){return chk;}body_20.__dustBody=!0;function body_21(chk,ctx){return chk.h("gt",ctx,{"else":body_22,"block":body_23},{"key":ctx.getPath(false, ["symbol","returns","length"]),"value":"1","type":"number"},"h");}body_21.__dustBody=!0;function body_22(chk,ctx){return chk.w("<p><b>Returns:</b>&nbsp;&nbsp;").f(ctx.get(["symbol"], false),ctx,"h",["s","$returns"]).w("</p>");}body_22.__dustBody=!0;function body_23(chk,ctx){return chk.w("<b>Returns:</b><p class=\"pad-left\">").f(ctx.get(["symbol"], false),ctx,"h",["s","$returns"]).w("</p>");}body_23.__dustBody=!0;function body_24(chk,ctx){return chk.h("gt",ctx,{"else":body_25,"block":body_26},{"key":ctx.getPath(false, ["symbol","exceptions","length"]),"value":"1","type":"number"},"h");}body_24.__dustBody=!0;function body_25(chk,ctx){return chk.w("<p><b>Throws:</b>&nbsp;&nbsp;").f(ctx.get(["symbol"], false),ctx,"h",["s","$exceptions"]).w("</p>");}body_25.__dustBody=!0;function body_26(chk,ctx){return chk.w("<b>Throws:</b><p class=\"pad-left\">").f(ctx.get(["symbol"], false),ctx,"h",["s","$exceptions"]).w("</p>");}body_26.__dustBody=!0;function body_27(chk,ctx){return chk.p("enums",ctx,ctx.rebase(ctx.get(["symbol"], false)),{});}body_27.__dustBody=!0;function body_28(chk,ctx){return chk.w("<p><b>Example</b></p>").s(ctx.getPath(false, ["symbol","examples"]),ctx,{"block":body_29},{});}body_28.__dustBody=!0;function body_29(chk,ctx){return chk.w("<pre><code>").f(ctx.getPath(true, []),ctx,"h",["$nt"]).w("</code></pre>");}body_29.__dustBody=!0;function body_30(chk,ctx){return chk.x(ctx.getPath(false, ["symbol","$constructor"]),ctx,{"block":body_31},{});}body_30.__dustBody=!0;function body_31(chk,ctx){return chk.p("symbol",ctx,ctx,{"symbol":ctx.getPath(false, ["symbol","$constructor"]),"template":ctx.get(["template"], false)});}body_31.__dustBody=!0;function body_32(chk,ctx){return chk.s(ctx.getPath(false, ["symbol","$members"]),ctx,{"block":body_33},{});}body_32.__dustBody=!0;function body_33(chk,ctx){return chk.p("symbol",ctx,ctx,{"symbol":ctx.getPath(true, []),"template":ctx.get(["template"], false)});}body_33.__dustBody=!0;function body_34(chk,ctx){return chk;}body_34.__dustBody=!0;return body_0}(dust));
/*!
 * Docma (Web) Core
 * https://github.com/onury/docma
 * @license MIT
 */
var docma = {"routes":[{"id":"api:","type":"api","name":"_def_","path":"/?api","contentPath":null},{"id":"api:game","type":"api","name":"game","path":"/?api=game","contentPath":null},{"id":"api:scene","type":"api","name":"scene","path":"/?api=scene","contentPath":null},{"id":"api:drawable","type":"api","name":"drawable","path":"/?api=drawable","contentPath":null},{"id":"api:behaviors","type":"api","name":"behaviors","path":"/?api=behaviors","contentPath":null},{"id":"api:fx","type":"api","name":"fx","path":"/?api=fx","contentPath":null},{"id":"api:map","type":"api","name":"map","path":"/?api=map","contentPath":null},{"id":"api:input","type":"api","name":"input","path":"/?api=input","contentPath":null},{"id":"api:audio","type":"api","name":"audio","path":"/?api=audio","contentPath":null},{"id":"api:resource","type":"api","name":"resource","path":"/?api=resource","contentPath":null},{"id":"api:notification","type":"api","name":"notification","path":"/?api=notification","contentPath":null},{"id":"api:utils","type":"api","name":"utils","path":"/?api=utils","contentPath":null},{"id":"content:home","type":"content","name":"home","path":"/?content=home","contentPath":"content/home.html"},{"id":"content:start","type":"content","name":"start","path":"/?content=start","contentPath":"content/start.html"},{"id":"content:made_with_athenajs","type":"content","name":"made_with_athenajs","path":"/?content=made_with_athenajs","contentPath":"content/made_with_athenajs.html"}],"apis":{"_def_":{"documentation":[],"symbols":[]},"game":{"documentation":[{"comment":"/**\n * The `Game` class is the central part to AthenaJS.\n *\n * @param {Object} [options={}]\n * @param {Boolean} [options.debug=false] Debug will be enabled if this is true.\n * @param {String} [options.name] The name of the game.\n * @param {String|HTMLElement} [options.target=\"Dom('div')\"] target The DOM target of the game: this is where the game canvas elements will be added.\n * By default the target is a new Div that is appened to the body element.\n * @param {Boolean} [options.showFps=false] A little fps counter will be displayed if this is true.\n * @param {Number} [options.width=1024] The width of the game display.\n * @param {Number} [options.height=768] The height of the game display.\n * @param {Object} [options.resources] An optionnal array of resources of the form:`{ id: 'unique id', type: 'image|script|map|audio', src: 'path_to_resource'}` that the scene needs.\n * @example\n * import { Game } from 'athenajs';\n *\n * const myGame = new Game({\n *    name: 'first-game',\n *    width: 320,\n *    height: 200\n * });\n */","meta":{"range":[1386,16839],"filename":"Game.js","lineno":30,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\Game","code":{"id":"astnode100000030","name":"Game","type":"ClassDeclaration","paramnames":["options"]}},"classdesc":"The `Game` class is the central part to AthenaJS.","params":[{"type":{"names":["Object"]},"optional":true,"defaultvalue":"{}","name":"options"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"Debug will be enabled if this is true.","name":"options.debug"},{"type":{"names":["String"]},"optional":true,"description":"The name of the game.","name":"options.name"},{"type":{"names":["String","HTMLElement"]},"optional":true,"defaultvalue":"\"Dom('div')\"","description":"target The DOM target of the game: this is where the game canvas elements will be added.\nBy default the target is a new Div that is appened to the body element.","name":"options.target"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"A little fps counter will be displayed if this is true.","name":"options.showFps"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":1024,"description":"The width of the game display.","name":"options.width"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":768,"description":"The height of the game display.","name":"options.height"},{"type":{"names":["Object"]},"optional":true,"description":"An optionnal array of resources of the form:`{ id: 'unique id', type: 'image|script|map|audio', src: 'path_to_resource'}` that the scene needs.","name":"options.resources"}],"examples":["import { Game } from 'athenajs';\n\nconst myGame = new Game({\n   name: 'first-game',\n   width: 320,\n   height: 200\n});"],"name":"Game","longname":"Game","kind":"class","scope":"global","description":"Creates a new Game","$longname":"Game","$members":[{"comment":"/**\n     * Get ready for events from NotificationManager\n     *\n     * @param {String} eventList space-separated list of events to listen to\n     *\n     */","meta":{"range":[8427,8511],"filename":"Game.js","lineno":227,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Game","code":{"id":"astnode100000827","name":"Game#bindEvents","type":"MethodDefinition","paramnames":["eventList"]},"vars":{"":null}},"description":"Get ready for events from NotificationManager","params":[{"type":{"names":["String"]},"description":"space-separated list of events to listen to","name":"eventList"}],"name":"bindEvents","longname":"Game#bindEvents","kind":"function","memberof":"Game","scope":"instance","$longname":"Game#bindEvents"},{"comment":"/**\n     * Method that gets called when receiving an event: by default it does nothing\n     * It's up to the developer to override this method on its Game\n     *\n     * @param {String} event the event name that got fired.\n     *\n     */","meta":{"range":[8759,8796],"filename":"Game.js","lineno":239,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Game","code":{"id":"astnode100000845","name":"Game#onEvent","type":"MethodDefinition","paramnames":["event"]},"vars":{"":null}},"description":"Method that gets called when receiving an event: by default it does nothing\nIt's up to the developer to override this method on its Game","params":[{"type":{"names":["String"]},"description":"the event name that got fired.","name":"event"}],"name":"onEvent","longname":"Game#onEvent","kind":"function","memberof":"Game","scope":"instance","$longname":"Game#onEvent"},{"comment":"/**\n     * Sets a new scene as the current scene\n     *\n     * @param {Scene} scene instance to set as current Scene\n     *\n     */","meta":{"range":[11521,12410],"filename":"Game.js","lineno":335,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Game","code":{"id":"astnode100001029","name":"Game#setScene","type":"MethodDefinition","paramnames":["scene"]},"vars":{"":null}},"description":"Sets a new scene as the current scene","params":[{"type":{"names":["Scene"]},"description":"instance to set as current Scene","name":"scene"}],"name":"setScene","longname":"Game#setScene","kind":"function","memberof":"Game","scope":"instance","$longname":"Game#setScene"},{"comment":"/**\n     * Toggles fullscreen status\n     */","meta":{"range":[9073,9182],"filename":"Game.js","lineno":258,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Game","code":{"id":"astnode100000869","name":"Game#toggleFullscreen","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Toggles fullscreen status","name":"toggleFullscreen","longname":"Game#toggleFullscreen","kind":"function","memberof":"Game","scope":"instance","params":[],"$longname":"Game#toggleFullscreen"},{"comment":"/**\n     * Pauses the game: both loops are stopped so almost no cpu/gpu is used when calling it\n     *\n     */","meta":{"range":[15678,16260],"filename":"Game.js","lineno":477,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Game","code":{"id":"astnode100001367","name":"Game#togglePause","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Pauses the game: both loops are stopped so almost no cpu/gpu is used when calling it","name":"togglePause","longname":"Game#togglePause","kind":"function","memberof":"Game","scope":"instance","params":[],"$longname":"Game#togglePause"},{"comment":"/**\n     * Toggles global sound\n     *\n     * @param {Boolean} bool Weather to enable or disable sound.\n     *\n     */","meta":{"range":[8926,9018],"filename":"Game.js","lineno":250,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Game","code":{"id":"astnode100000852","name":"Game#toggleSound","type":"MethodDefinition","paramnames":["bool"]},"vars":{"":null}},"description":"Toggles global sound","params":[{"type":{"names":["Boolean"]},"description":"Weather to enable or disable sound.","name":"bool"}],"name":"toggleSound","longname":"Game#toggleSound","kind":"function","memberof":"Game","scope":"instance","$longname":"Game#toggleSound"},{"comment":"/**\n     * Toggles the Map tiles inspector\n     *\n     * @param {Boolean} enable whether to enable the tileInspector\n     */","meta":{"range":[7794,8261],"filename":"Game.js","lineno":207,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Game","code":{"id":"astnode100000759","name":"Game#toggleTileInspector","type":"MethodDefinition","paramnames":["enable"]},"vars":{"":null}},"description":"Toggles the Map tiles inspector","params":[{"type":{"names":["Boolean"]},"description":"whether to enable the tileInspector","name":"enable"}],"name":"toggleTileInspector","longname":"Game#toggleTileInspector","kind":"function","memberof":"Game","scope":"instance","$longname":"Game#toggleTileInspector"}],"$constructor":{"comment":"/**\n     * Creates a new Game\n     *\n     * @param {Object} [options={}]\n     * @param {Boolean} [options.debug=false] Debug will be enabled if this is true.\n     * @param {String} [options.name] The name of the game.\n     * @param {String|HTMLElement} [options.target=\"Dom('div')\"] target The DOM target of the game: this is where the game canvas elements will be added.\n     * By default the target is a new Div that is appened to the body element.\n     * @param {Boolean} [options.showFps=false] A little fps counter will be displayed if this is true.\n     * @param {Number} [options.width=1024] The width of the game display.\n     * @param {Number} [options.height=768] The height of the game display.\n     * @param {Object} [options.resources] An optionnal array of resources of the form:`{ id: 'unique id', type: 'image|script|map|audio', src: 'path_to_resource'}` that the scene needs.\n    */","meta":{"range":[2307,5124],"filename":"Game.js","lineno":44,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Game","code":{"id":"astnode100000033","name":"Game","type":"MethodDefinition","paramnames":["options"]},"vars":{"":null}},"description":"Creates a new Game","params":[{"type":{"names":["Object"]},"optional":true,"defaultvalue":"{}","name":"options"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"Debug will be enabled if this is true.","name":"options.debug"},{"type":{"names":["String"]},"optional":true,"description":"The name of the game.","name":"options.name"},{"type":{"names":["String","HTMLElement"]},"optional":true,"defaultvalue":"\"Dom('div')\"","description":"target The DOM target of the game: this is where the game canvas elements will be added.\nBy default the target is a new Div that is appened to the body element.","name":"options.target"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"A little fps counter will be displayed if this is true.","name":"options.showFps"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":1024,"description":"The width of the game display.","name":"options.width"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":768,"description":"The height of the game display.","name":"options.height"},{"type":{"names":["Object"]},"optional":true,"description":"An optionnal array of resources of the form:`{ id: 'unique id', type: 'image|script|map|audio', src: 'path_to_resource'}` that the scene needs.","name":"options.resources"}],"name":"Game","longname":"Game","kind":"class","scope":"global","undocumented":true,"$longname":"Game"}}],"symbols":["Game","Game#bindEvents","Game#onEvent","Game#setScene","Game#toggleFullscreen","Game#togglePause","Game#toggleSound","Game#toggleTileInspector"]},"scene":{"documentation":[{"comment":"/**\n * The `Scene` is used to display your objects. In AthenaJS you first add objects onto the scene.\n * \n * When you scene is rendered (at 60fps), your objects appear on the screen.\n *\n * Instead of creating a new scene, it is common to extend the Scene class to create your own scene.\n * @example\n * import { Scene, SimpleText } from 'athenajs';\n * \n * class MyScene extends Scene{\n *     start() {\n *         const myText = new SimpleText('my text', {\n *             text: 'This is a test',\n *             color: 'black'\n *         });\n *         // add the object onto the scene\n *         this.addObject(myText);\n *     }\n * };\n */","meta":{"range":[916,20796],"filename":"Scene.js","lineno":29,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\Scene","code":{"id":"astnode100000564","name":"Scene","type":"ClassDeclaration","paramnames":["options"]}},"classdesc":"The `Scene` is used to display your objects. In AthenaJS you first add objects onto the scene.\n\nWhen you scene is rendered (at 60fps), your objects appear on the screen.\n\nInstead of creating a new scene, it is common to extend the Scene class to create your own scene.","examples":["import { Scene, SimpleText } from 'athenajs';\n\nclass MyScene extends Scene{\n    start() {\n        const myText = new SimpleText('my text', {\n            text: 'This is a test',\n            color: 'black'\n        });\n        // add the object onto the scene\n        this.addObject(myText);\n    }\n};"],"name":"Scene","longname":"Scene","kind":"class","scope":"global","description":"Creates a new Scene","params":[{"type":{"names":["Object"]},"name":"options"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"Scene\"+timestamp","description":"The name of your scene.","name":"options.name"},{"type":{"names":["Object"]},"optional":true,"description":"An optional array of resources of the form: `{ id: 'unique id', type: 'image|script|map|audio', src: 'path_to_resource'}` that the scene needs.","name":"options.resources"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":2,"description":"The number of layers: layers are stacked above the backgrounds.","name":"options.layers"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":1,"description":"The default opacity for the scene: can be usefull to have fadeIn effects when starting the scene.","name":"options.opacity"},{"type":{"names":["Scene"]},"optional":true,"description":"Scenes can have an option `hud` scene that is automatically rendered on top of it. This allows to easily add score/status elements to games.","name":"options.hudScene"}],"$longname":"Scene","$members":[{"comment":"/**\n     * Add one ore more display objects onto the scene\n     *\n     * @param {Array|Drawable} objects The object(s) to add onto the scene.\n     * @param {Number} [layerIndex=0] Defines the layer number where to add the objects.\n     */","meta":{"range":[11510,12333],"filename":"Scene.js","lineno":393,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Scene","code":{"id":"astnode100001473","name":"Scene#addObject","type":"MethodDefinition","paramnames":["objects","layerIndex"]},"vars":{"":null}},"description":"Add one ore more display objects onto the scene","params":[{"type":{"names":["Array","Drawable"]},"description":"The object(s) to add onto the scene.","name":"objects"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"Defines the layer number where to add the objects.","name":"layerIndex"}],"name":"addObject","longname":"Scene#addObject","kind":"function","memberof":"Scene","scope":"instance","$longname":"Scene#addObject"},{"comment":"/**\n     * Apply the specified effect to the scene\n     *\n     * @param {String} fxName The name of the effect to apply.\n     * @param {Object} options The options of the effect.\n     */","meta":{"range":[20340,20432],"filename":"Scene.js","lineno":731,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Scene","code":{"id":"astnode100002174","name":"Scene#animate","type":"MethodDefinition","paramnames":["fxName","options"]},"vars":{"":null}},"description":"Apply the specified effect to the scene","params":[{"type":{"names":["String"]},"description":"The name of the effect to apply.","name":"fxName"},{"type":{"names":["Object"]},"description":"The options of the effect.","name":"options"}],"name":"animate","longname":"Scene#animate","kind":"function","memberof":"Scene","scope":"instance","$longname":"Scene#animate"},{"comment":"/**\n     * Subscribe to a space-separated list of events.\n     *\n     * @param {String} eventList The list of events to subscribe to as a space separated string.\n     *\n     * @note Events are automatically unbound when changing scene.\n     */","meta":{"range":[19603,19687],"filename":"Scene.js","lineno":699,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Scene","code":{"id":"astnode100002128","name":"Scene#bindEvents","type":"MethodDefinition","paramnames":["eventList"]},"vars":{"":null}},"description":"Subscribe to a space-separated list of events.","params":[{"type":{"names":["String"]},"description":"The list of events to subscribe to as a space separated string.","name":"eventList"}],"tags":[{"originalTitle":"note","title":"note","text":"Events are automatically unbound when changing scene.","value":"Events are automatically unbound when changing scene."}],"name":"bindEvents","longname":"Scene#bindEvents","kind":"function","memberof":"Scene","scope":"instance","$longname":"Scene#bindEvents"},{"comment":"/**\n     * Simple debug method: only toggles map boxes for now\n     *\n     * @param {Boolean} [isDebug=undefined] if specified, this will be the new debug status, otherwise toggle current debug status\n     */","meta":{"range":[7769,8139],"filename":"Scene.js","lineno":271,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Scene","code":{"id":"astnode100001160","name":"Scene#debug","type":"MethodDefinition","paramnames":["isDebug"]},"vars":{"":null}},"description":"Simple debug method: only toggles map boxes for now","params":[{"type":{"names":["Boolean"]},"optional":true,"description":"if specified, this will be the new debug status, otherwise toggle current debug status","name":"isDebug"}],"name":"debug","longname":"Scene#debug","kind":"function","memberof":"Scene","scope":"instance","$longname":"Scene#debug"},{"comment":"/**\n     * Returns the current opacity of the scene\n     *\n     * @returns {Number} The current opacity value.\n     */","meta":{"range":[15100,15149],"filename":"Scene.js","lineno":510,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Scene","code":{"id":"astnode100001775","name":"Scene#getOpacity","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the current opacity of the scene","returns":[{"type":{"names":["Number"]},"description":"The current opacity value."}],"name":"getOpacity","longname":"Scene#getOpacity","kind":"function","memberof":"Scene","scope":"instance","params":[],"$longname":"Scene#getOpacity"},{"comment":"/**\n     * Get the total playtime\n     *\n     * @returns {Number} the total playtime in milliseconds\n     */","meta":{"range":[17440,17675],"filename":"Scene.js","lineno":626,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Scene","code":{"id":"astnode100001991","name":"Scene#getPlayTime","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Get the total playtime","returns":[{"type":{"names":["Number"]},"description":"the total playtime in milliseconds"}],"name":"getPlayTime","longname":"Scene#getPlayTime","kind":"function","memberof":"Scene","scope":"instance","params":[],"$longname":"Scene#getPlayTime"},{"comment":"/**\n     *\n     * Adds a new resource to be loaded later\n     *\n     */","meta":{"range":[5586,5841],"filename":"Scene.js","lineno":193,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Scene","code":{"id":"astnode100000983","name":"Scene#load","type":"MethodDefinition","paramnames":["type","src","id"]},"vars":{"":null}},"description":"Adds a new resource to be loaded later","name":"load","longname":"Scene#load","kind":"function","memberof":"Scene","scope":"instance","params":[],"$longname":"Scene#load"},{"comment":"/**\n     * Adds an audio file to the scene resource list\n     *\n     * @param {String} src The url of the file to load.\n     * @param {String} id The id to use for the audio file.\n     *\n     * @note this method should be called in the `setup` method\n     */","meta":{"range":[6446,6523],"filename":"Scene.js","lineno":226,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Scene","code":{"id":"astnode100001038","name":"Scene#loadAudio","type":"MethodDefinition","paramnames":["src","id"]},"vars":{"":null}},"description":"Adds an audio file to the scene resource list","params":[{"type":{"names":["String"]},"description":"The url of the file to load.","name":"src"},{"type":{"names":["String"]},"description":"The id to use for the audio file.","name":"id","defaultvalue":null}],"tags":[{"originalTitle":"note","title":"note","text":"this method should be called in the `setup` method","value":"this method should be called in the `setup` method"}],"name":"loadAudio","longname":"Scene#loadAudio","kind":"function","memberof":"Scene","scope":"instance","$longname":"Scene#loadAudio"},{"comment":"/**\n     * Adds an image to the scene resource list\n     *\n     * @param {String} src The url of the file to load.\n     * @param {String} id The id to use for the image.\n     *\n     * @note this method should be called in the `setup` method\n     */","meta":{"range":[6100,6177],"filename":"Scene.js","lineno":214,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Scene","code":{"id":"astnode100001020","name":"Scene#loadImage","type":"MethodDefinition","paramnames":["src","id"]},"vars":{"":null}},"description":"Adds an image to the scene resource list","params":[{"type":{"names":["String"]},"description":"The url of the file to load.","name":"src"},{"type":{"names":["String"]},"description":"The id to use for the image.","name":"id","defaultvalue":null}],"tags":[{"originalTitle":"note","title":"note","text":"this method should be called in the `setup` method","value":"this method should be called in the `setup` method"}],"name":"loadImage","longname":"Scene#loadImage","kind":"function","memberof":"Scene","scope":"instance","$longname":"Scene#loadImage"},{"comment":"/**\n     * Adds a map file to the scene resource list\n     *\n     * @param {String} src The url of the file to load.\n     * @param {String} id The id to use for the map.\n     *\n     */","meta":{"range":[6718,6791],"filename":"Scene.js","lineno":237,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Scene","code":{"id":"astnode100001056","name":"Scene#loadMap","type":"MethodDefinition","paramnames":["src","id"]},"vars":{"":null}},"description":"Adds a map file to the scene resource list","params":[{"type":{"names":["String"]},"description":"The url of the file to load.","name":"src"},{"type":{"names":["String"]},"description":"The id to use for the map.","name":"id","defaultvalue":null}],"name":"loadMap","longname":"Scene#loadMap","kind":"function","memberof":"Scene","scope":"instance","$longname":"Scene#loadMap"},{"comment":"/**\n     * Notify the scene of an event\n     *\n     * @param {String} eventType The type of event to trigger.\n     * @param {any} data The data (if any) associated with the event.\n     */","meta":{"range":[19282,19349],"filename":"Scene.js","lineno":688,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Scene","code":{"id":"astnode100002115","name":"Scene#notify","type":"MethodDefinition","paramnames":["eventType","data"]},"vars":{"":null}},"description":"Notify the scene of an event","params":[{"type":{"names":["String"]},"description":"The type of event to trigger.","name":"eventType"},{"type":{"names":["any"]},"description":"The data (if any) associated with the event.","name":"data"}],"name":"notify","longname":"Scene#notify","kind":"function","memberof":"Scene","scope":"instance","$longname":"Scene#notify"},{"comment":"/**\n     * onEvent is called once one of the registered events has been triggered.\n     *\n     * Override this scene as needed.\n     */","meta":{"range":[19833,19851],"filename":"Scene.js","lineno":708,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Scene","code":{"id":"astnode100002146","name":"Scene#onEvent","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"onEvent is called once one of the registered events has been triggered.\n\nOverride this scene as needed.","name":"onEvent","longname":"Scene#onEvent","kind":"function","memberof":"Scene","scope":"instance","params":[],"$longname":"Scene#onEvent"},{"comment":"/**\n     * Called when the scene is paused. This may happen for several reasons:\n     * - browser tab is hidden\n     * - debug is enabled and user pressed the p key\n     *\n     * @param {Boolean} isRunning\n     */","meta":{"range":[17278,17321],"filename":"Scene.js","lineno":617,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Scene","code":{"id":"astnode100001984","name":"Scene#pause","type":"MethodDefinition","paramnames":["isRunning"]},"vars":{"":null}},"description":"Called when the scene is paused. This may happen for several reasons:\n- browser tab is hidden\n- debug is enabled and user pressed the p key","params":[{"type":{"names":["Boolean"]},"name":"isRunning"}],"name":"pause","longname":"Scene#pause","kind":"function","memberof":"Scene","scope":"instance","$longname":"Scene#pause"},{"comment":"/**\n     * Remove the specified object from the scene\n     *\n     * @param {Drawable} drawable The object to remove from the scene.\n     */","meta":{"range":[20582,20794],"filename":"Scene.js","lineno":740,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Scene","code":{"id":"astnode100002190","name":"Scene#removeObject","type":"MethodDefinition","paramnames":["drawable"]},"vars":{"":null}},"description":"Remove the specified object from the scene","params":[{"type":{"names":["Drawable"]},"description":"The object to remove from the scene.","name":"drawable"}],"name":"removeObject","longname":"Scene#removeObject","kind":"function","memberof":"Scene","scope":"instance","$longname":"Scene#removeObject"},{"comment":"/**\n     * This method is responsible for drawing the scene and will be called 60 times a second.\n     *\n     * @param {Array<RenderingContext>} drawContexts The layers array to draw over.\n     * *note* When the scene is not running, this method isn't called at all.\n     */","meta":{"range":[18499,18808],"filename":"Scene.js","lineno":662,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Scene","code":{"id":"astnode100002059","name":"Scene#render","type":"MethodDefinition","paramnames":["drawContexts"]},"vars":{"":null}},"description":"This method is responsible for drawing the scene and will be called 60 times a second.","params":[{"type":{"names":["Array.<RenderingContext>"]},"description":"The layers array to draw over.\n*note* When the scene is not running, this method isn't called at all.","name":"drawContexts"}],"name":"render","longname":"Scene#render","kind":"function","memberof":"Scene","scope":"instance","$longname":"Scene#render"},{"comment":"/**\n     * Set a static (CSS) background image independently of the layers\n     *\n     * @param {(Image|String)} image The image to set as background.\n     * @obsolete\n     */","meta":{"range":[15335,15684],"filename":"Scene.js","lineno":520,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Scene","code":{"id":"astnode100001783","name":"Scene#setBackgroundImage","type":"MethodDefinition","paramnames":["image"]},"vars":{"":null}},"description":"Set a static (CSS) background image independently of the layers","params":[{"type":{"names":["Image","String"]},"description":"The image to set as background.","name":"image"}],"tags":[{"originalTitle":"obsolete","title":"obsolete","text":""}],"name":"setBackgroundImage","longname":"Scene#setBackgroundImage","kind":"function","memberof":"Scene","scope":"instance","$longname":"Scene#setBackgroundImage"},{"comment":"/**\n     * Attach the specified display to the scene\n     *\n     * @param {Display} display The display to attach the scene to.\n     */","meta":{"range":[19997,20143],"filename":"Scene.js","lineno":717,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Scene","code":{"id":"astnode100002150","name":"Scene#setDisplay","type":"MethodDefinition","paramnames":["display"]},"vars":{"":null}},"description":"Attach the specified display to the scene","params":[{"type":{"names":["Display"]},"description":"The display to attach the scene to.","name":"display"}],"name":"setDisplay","longname":"Scene#setDisplay","kind":"function","memberof":"Scene","scope":"instance","$longname":"Scene#setDisplay"},{"comment":"/**\n     *\n     * @param {Number} layer Layer number.\n     * @param {Boolean} background Set to true to put layer in background, false for foreground.\n     */","meta":{"range":[18977,19084],"filename":"Scene.js","lineno":678,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Scene","code":{"id":"astnode100002097","name":"Scene#setLayerPriority","type":"MethodDefinition","paramnames":["layer","background"]},"vars":{"":null}},"params":[{"type":{"names":["Number"]},"description":"Layer number.","name":"layer"},{"type":{"names":["Boolean"]},"description":"Set to true to put layer in background, false for foreground.","name":"background"}],"name":"setLayerPriority","longname":"Scene#setLayerPriority","kind":"function","memberof":"Scene","scope":"instance","$longname":"Scene#setLayerPriority"},{"comment":"/**\n     * Associates the specified map with the scene: the map will then be used to render the scene.\n     * *note* The map can either be an instance of a Map or a class inheriting from Map, in which case\n     *\n     * @param {Map|Object} map The `Map` to use: it can be an instance of a Map inheriting class or\n     * an options Object that will be used to create a new {Map} instance\n     *\n     * @param {Number} [x=0] x Offset where to start drawing the map onto the scene.\n     * @param {Number} [y=0] y Offset where to start drawing the map onto the scene.\n     *\n     */","meta":{"range":[10326,10640],"filename":"Scene.js","lineno":346,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Scene","code":{"id":"astnode100001342","name":"Scene#setMap","type":"MethodDefinition","paramnames":["map","x","y"]},"vars":{"":null}},"description":"Associates the specified map with the scene: the map will then be used to render the scene.\n*note* The map can either be an instance of a Map or a class inheriting from Map, in which case","params":[{"type":{"names":["Map","Object"]},"description":"The `Map` to use: it can be an instance of a Map inheriting class or\nan options Object that will be used to create a new {Map} instance","name":"map"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"x Offset where to start drawing the map onto the scene.","name":"x"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"y Offset where to start drawing the map onto the scene.","name":"y"}],"name":"setMap","longname":"Scene#setMap","kind":"function","memberof":"Scene","scope":"instance","$longname":"Scene#setMap"},{"comment":"/**\n     * Changes the opacity of the scene\n     *\n     * @param {Number} opacity The new opacity.\n     */","meta":{"range":[14912,14971],"filename":"Scene.js","lineno":501,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Scene","code":{"id":"astnode100001764","name":"Scene#setOpacity","type":"MethodDefinition","paramnames":["opacity"]},"vars":{"":null}},"description":"Changes the opacity of the scene","params":[{"type":{"names":["Number"]},"description":"The new opacity.","name":"opacity"}],"name":"setOpacity","longname":"Scene#setOpacity","kind":"function","memberof":"Scene","scope":"instance","$longname":"Scene#setOpacity"},{"comment":"/**\n     * Public setup method: this method is called right after internal Scene._setup().\n     *\n     * You should overriden it in your own Scene instances.\n     */","meta":{"range":[15860,15949],"filename":"Scene.js","lineno":535,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Scene","code":{"id":"astnode100001836","name":"Scene#setup","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Public setup method: this method is called right after internal Scene._setup().\n\nYou should overriden it in your own Scene instances.","name":"setup","longname":"Scene#setup","kind":"function","memberof":"Scene","scope":"instance","params":[],"$longname":"Scene#setup"},{"comment":"/**\n     * Starts the scene\n     *\n     */","meta":{"range":[16860,16875],"filename":"Scene.js","lineno":595,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Scene","code":{"id":"astnode100001958","name":"Scene#start","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Starts the scene","name":"start","longname":"Scene#start","kind":"function","memberof":"Scene","scope":"instance","params":[],"$longname":"Scene#start"},{"comment":"/**\n     * The run loop is where scene elements are moved and collisions are checked.\n     *\n     * The map, if there is one, is also updated here (viewport, new objects, etc)\n     *\n     * @param {Number} timestamp current times\n     */","meta":{"range":[17923,18214],"filename":"Scene.js","lineno":645,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Scene","code":{"id":"astnode100002027","name":"Scene#update","type":"MethodDefinition","paramnames":["timestamp"]},"vars":{"":null}},"description":"The run loop is where scene elements are moved and collisions are checked.\n\nThe map, if there is one, is also updated here (viewport, new objects, etc)","params":[{"type":{"names":["Number"]},"description":"current times","name":"timestamp"}],"name":"update","longname":"Scene#update","kind":"function","memberof":"Scene","scope":"instance","$longname":"Scene#update"}],"$constructor":{"comment":"/**\n     * Creates a new Scene\n     *\n     * @param {Object} options\n     * @param {String} [options.name=\"Scene\"+timestamp] The name of your scene.\n     * @param {Object} [options.resources] An optional array of resources of the form: `{ id: 'unique id', type: 'image|script|map|audio', src: 'path_to_resource'}` that the scene needs.\n     * @param {Number} [options.layers=2] The number of layers: layers are stacked above the backgrounds.\n     * @param {Number} [options.opacity=1] The default opacity for the scene: can be usefull to have fadeIn effects when starting the scene.\n     * @param {Scene} [options.hudScene] Scenes can have an option `hud` scene that is automatically rendered on top of it. This allows to easily add score/status elements to games.\n     */","meta":{"range":[1711,2704],"filename":"Scene.js","lineno":40,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Scene","code":{"id":"astnode100000567","name":"Scene","type":"MethodDefinition","paramnames":["options"]},"vars":{"":null}},"description":"Creates a new Scene","params":[{"type":{"names":["Object"]},"name":"options"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"Scene\"+timestamp","description":"The name of your scene.","name":"options.name"},{"type":{"names":["Object"]},"optional":true,"description":"An optional array of resources of the form: `{ id: 'unique id', type: 'image|script|map|audio', src: 'path_to_resource'}` that the scene needs.","name":"options.resources"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":2,"description":"The number of layers: layers are stacked above the backgrounds.","name":"options.layers"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":1,"description":"The default opacity for the scene: can be usefull to have fadeIn effects when starting the scene.","name":"options.opacity"},{"type":{"names":["Scene"]},"optional":true,"description":"Scenes can have an option `hud` scene that is automatically rendered on top of it. This allows to easily add score/status elements to games.","name":"options.hudScene"}],"name":"Scene","longname":"Scene","kind":"class","scope":"global","undocumented":true,"$longname":"Scene"}}],"symbols":["Scene","Scene#addObject","Scene#animate","Scene#bindEvents","Scene#debug","Scene#getOpacity","Scene#getPlayTime","Scene#load","Scene#loadAudio","Scene#loadImage","Scene#loadMap","Scene#notify","Scene#onEvent","Scene#pause","Scene#removeObject","Scene#render","Scene#setBackgroundImage","Scene#setDisplay","Scene#setLayerPriority","Scene#setMap","Scene#setOpacity","Scene#setup","Scene#start","Scene#update"]},"drawable":{"documentation":[{"comment":"/**\n * The BitmapText class allows to use a spritesheet as a font to draw text onto the screen\n * \n * @extends Drawable\n */","meta":{"range":[187,14846],"filename":"BitmapText.js","lineno":9,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100000010","name":"BitmapText","type":"ClassDeclaration","paramnames":["type","options"]}},"classdesc":"The BitmapText class allows to use a spritesheet as a font to draw text onto the screen","augments":["Drawable"],"name":"BitmapText","longname":"BitmapText","kind":"class","scope":"global","description":"Creates a new BitmapText Drawable","params":[{"type":{"names":["String"]},"optional":true,"defaultvalue":"'BitmapText'","description":"The type of the sprite.","name":"type"},{"type":{"names":["Object"]},"description":"The options describing the BitmapText.","name":"options"},{"type":{"names":["String"]},"description":"The path to the spritesheet file.","name":"options.imageId"},{"type":{"names":["Number"]},"optional":true,"description":"The width of a character in pixels.","name":"options.charWidth"},{"type":{"names":["Number"]},"optional":true,"description":"The height of a character in pixels.","name":"options.charHeight"},{"type":{"names":["String"]},"optional":true,"description":"The list of supported characters in the spritesheet","name":"options.characters"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":"charWidth","description":"The full width of the character (including spaces) inside the spritesheet","name":"options.offsetX"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":2,"description":"The space between each drawn character (in pixels).","name":"options.letterSpacing"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"The optinal vertical offset at which to start getting bitmap characters.","name":"options.startY"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"The optinal hoeizontal offset at which to start getting bitmap characters.","name":"options.startX"}],"$longname":"BitmapText","$members":[{"comment":"/**\n     * Add a new Child to the object.\n     *\n     * Childs are automatically rendered and moved when the parent object is.\n     *\n     * @param {Drawable} child The child to add.\n     *\n     * @note children are automatically added to the scene/map of the parent object.\n     */","meta":{"range":[24998,25139],"filename":"Drawable.js","lineno":877,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003691","name":"Drawable#addChild","type":"MethodDefinition","paramnames":["child"]},"vars":{"":null}},"description":"Add a new Child to the object.\n\nChilds are automatically rendered and moved when the parent object is.","params":[{"type":{"names":["Drawable"]},"description":"The child to add.","name":"child"}],"tags":[{"originalTitle":"note","title":"note","text":"children are automatically added to the scene/map of the parent object.","value":"children are automatically added to the scene/map of the parent object."}],"name":"addChild","longname":"BitmapText#addChild","kind":"function","memberof":"BitmapText","scope":"instance","inherits":"Drawable#addChild","inherited":true,"$longname":"BitmapText#addChild"},{"comment":"/**\n     * Add a new handler to be called after each move of the object\n     *\n     * @param {Function} cb The callback to add.\n     */","meta":{"range":[20765,20827],"filename":"Drawable.js","lineno":731,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003406","name":"Drawable#addMoveHandler","type":"MethodDefinition","paramnames":["cb"]},"vars":{"":null}},"description":"Add a new handler to be called after each move of the object","params":[{"type":{"names":["function"]},"description":"The callback to add.","name":"cb"}],"name":"addMoveHandler","longname":"BitmapText#addMoveHandler","kind":"function","memberof":"BitmapText","scope":"instance","inherits":"Drawable#addMoveHandler","inherited":true,"$longname":"BitmapText#addMoveHandler"},{"comment":"/**\n     * Performs an animation on the object using one of the defined {FX} effects\n     *\n     * Effects change the object size/position using an interpolation function.\n     *\n     * Athena has the following effects:\n     * - {Fade} performs a fade\n     * - {Mosaic} performs a SNES-like mosaic effect\n     * - {Rotate} performs a rotation on the object\n     *\n     * @param {String} fxName The name of the effect to use.\n     * @param {Object} options The options of the effect.\n     * @param {String} [options.easing=\"linear\"] The easing functions to use, can be: 'linear', 'swing', 'easeInQuad', 'easeOutBounce'.\n     *\n     * @returns {Promise} a promise that will be fullfilled when the effect has been completed\n     */","meta":{"range":[22444,23247],"filename":"Drawable.js","lineno":787,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003490","name":"Drawable#animate","type":"MethodDefinition","paramnames":["fxName","options"]},"vars":{"":null}},"description":"Performs an animation on the object using one of the defined {FX} effects\n\nEffects change the object size/position using an interpolation function.\n\nAthena has the following effects:\n- {Fade} performs a fade\n- {Mosaic} performs a SNES-like mosaic effect\n- {Rotate} performs a rotation on the object","params":[{"type":{"names":["String"]},"description":"The name of the effect to use.","name":"fxName"},{"type":{"names":["Object"]},"description":"The options of the effect.","name":"options"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"linear\"","description":"The easing functions to use, can be: 'linear', 'swing', 'easeInQuad', 'easeOutBounce'.","name":"options.easing"}],"returns":[{"type":{"names":["Promise"]},"description":"a promise that will be fullfilled when the effect has been completed"}],"name":"animate","longname":"BitmapText#animate","kind":"function","memberof":"BitmapText","scope":"instance","inherits":"Drawable#animate","inherited":true,"$longname":"BitmapText#animate"},{"comment":"/**\n     * Stops the object from moving, optionnaly immediately going to target position\n     *\n     * @param {Boolean} [gotoTarget=false] Set to true to go to the target position.\n     */","meta":{"range":[8766,8998],"filename":"Drawable.js","lineno":305,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002243","name":"Drawable#cancelMoveTo","type":"MethodDefinition","paramnames":["gotoTarget"]},"vars":{"":null}},"description":"Stops the object from moving, optionnaly immediately going to target position","params":[{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"Set to true to go to the target position.","name":"gotoTarget"}],"name":"cancelMoveTo","longname":"BitmapText#cancelMoveTo","kind":"function","memberof":"BitmapText","scope":"instance","inherits":"Drawable#cancelMoveTo","inherited":true,"$longname":"BitmapText#cancelMoveTo"},{"comment":"/**\n     * Centers the object into the scene.\n     *\n     * @returns {Drawable} this\n     */","meta":{"range":[9101,9292],"filename":"Drawable.js","lineno":320,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002280","name":"Drawable#center","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Centers the object into the scene.","returns":[{"type":{"names":["Drawable"]},"description":"this"}],"name":"center","longname":"BitmapText#center","kind":"function","memberof":"BitmapText","scope":"instance","params":[],"inherits":"Drawable#center","inherited":true,"$longname":"BitmapText#center"},{"comment":"/**\n     * Stop using a particular behavior.\n     *\n     * The vx and vy properties of the object will be set to zero.\n     */","meta":{"range":[10033,10117],"filename":"Drawable.js","lineno":349,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002359","name":"Drawable#clearBehavior","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Stop using a particular behavior.\n\nThe vx and vy properties of the object will be set to zero.","name":"clearBehavior","longname":"BitmapText#clearBehavior","kind":"function","memberof":"BitmapText","scope":"instance","params":[],"inherits":"Drawable#clearBehavior","inherited":true,"$longname":"BitmapText#clearBehavior"},{"comment":"/**\n     * Clears the buffer\n     */","meta":{"range":[3320,3401],"filename":"BitmapText.js","lineno":99,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100000187","name":"BitmapText#clearBuffer","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Clears the buffer","name":"clearBuffer","longname":"BitmapText#clearBuffer","kind":"function","memberof":"BitmapText","scope":"instance","params":[],"$longname":"BitmapText#clearBuffer"},{"comment":"/**\n     * Generates a new buffer that can hold current text\n     *\n     * @param {Display} display the display to get the buffer from\n     */","meta":{"range":[2972,3273],"filename":"BitmapText.js","lineno":87,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100000160","name":"BitmapText#createBuffer","type":"MethodDefinition","paramnames":["display"]},"vars":{"":null}},"description":"Generates a new buffer that can hold current text","params":[{"type":{"names":["Display"]},"description":"the display to get the buffer from","name":"display"}],"name":"createBuffer","longname":"BitmapText#createBuffer","kind":"function","memberof":"BitmapText","scope":"instance","$longname":"BitmapText#createBuffer"},{"comment":"/**\n     * Destroy is called when an object is removed from a scene or object\n     *\n     * @note calling destroy on a parent will automatically call the destroy method of each child.\n     */","meta":{"range":[28118,28636],"filename":"Drawable.js","lineno":984,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003963","name":"Drawable#destroy","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Destroy is called when an object is removed from a scene or object","tags":[{"originalTitle":"note","title":"note","text":"calling destroy on a parent will automatically call the destroy method of each child.","value":"calling destroy on a parent will automatically call the destroy method of each child."}],"name":"destroy","longname":"BitmapText#destroy","kind":"function","memberof":"BitmapText","scope":"instance","params":[],"inherits":"Drawable#destroy","inherited":true,"$longname":"BitmapText#destroy"},{"comment":"/**\n     * Draws the specified line onto the screen\n     *\n     * @param {Object} options\n     * @param {Number} options.x The horizontal position of the line to draw\n     * @param {Number} options.x The vertical position of the line to draw\n     * @param {String} options.text The text to draw\n     *\n     * @example\n     *\n     * bitmapText.drawLine({\n     * \tx: 0,\n     *  y: 0,\n     *  text: 'hi there'\n     * })\n     */","meta":{"range":[10946,11689],"filename":"BitmapText.js","lineno":343,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100000883","name":"BitmapText#drawLine","type":"MethodDefinition","paramnames":["options"]},"vars":{"":null}},"description":"Draws the specified line onto the screen","params":[{"type":{"names":["Object"]},"name":"options"},{"type":{"names":["Number"]},"description":"The horizontal position of the line to draw","name":"options.x"},{"type":{"names":["Number"]},"description":"The vertical position of the line to draw","name":"options.x"},{"type":{"names":["String"]},"description":"The text to draw","name":"options.text"}],"examples":["bitmapText.drawLine({\n\tx: 0,\n y: 0,\n text: 'hi there'\n})"],"name":"drawLine","longname":"BitmapText#drawLine","kind":"function","memberof":"BitmapText","scope":"instance","$longname":"BitmapText#drawLine"},{"comment":"/**\n     * Returns the angle property of the object.\n     * \n     * @returns {Number} The angle of the object\n     */","meta":{"range":[14335,14380],"filename":"Drawable.js","lineno":510,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002734","name":"Drawable#getAngle","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the angle property of the object.","returns":[{"type":{"names":["Number"]},"description":"The angle of the object"}],"name":"getAngle","longname":"BitmapText#getAngle","kind":"function","memberof":"BitmapText","scope":"instance","params":[],"inherits":"Drawable#getAngle","inherited":true,"$longname":"BitmapText#getAngle"},{"comment":"/**\n     * Returns the character horizontal offset in pixels inside the spritesheet\n     *\n     * @param {String} char The character to get the position inside the spritesheet\n     *\n     * @returns {Number} The horizontal offset in pixels of the character\n     */","meta":{"range":[10159,10511],"filename":"BitmapText.js","lineno":314,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100000844","name":"BitmapText#getCharOffset","type":"MethodDefinition","paramnames":["char"]},"vars":{"":null}},"description":"Returns the character horizontal offset in pixels inside the spritesheet","params":[{"type":{"names":["String"]},"description":"The character to get the position inside the spritesheet","name":"char"}],"returns":[{"type":{"names":["Number"]},"description":"The horizontal offset in pixels of the character"}],"name":"getCharOffset","longname":"BitmapText#getCharOffset","kind":"function","memberof":"BitmapText","scope":"instance","$longname":"BitmapText#getCharOffset"},{"comment":"/**\n     * Returns the current height of the object: with some types of Drawables ({Sprite}),\n     * height can vary\n     *\n     * @returns {number} The current height of the object\n     *\n     * @related {Sprite}\n     */","meta":{"range":[16065,16119],"filename":"Drawable.js","lineno":592,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002825","name":"Drawable#getCurrentHeight","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the current height of the object: with some types of Drawables ({Sprite}),\nheight can vary","returns":[{"type":{"names":["number"]},"description":"The current height of the object"}],"tags":[{"originalTitle":"related","title":"related","text":"{Sprite}","value":"{Sprite}"}],"name":"getCurrentHeight","longname":"BitmapText#getCurrentHeight","kind":"function","memberof":"BitmapText","scope":"instance","params":[],"inherits":"Drawable#getCurrentHeight","inherited":true,"$longname":"BitmapText#getCurrentHeight"},{"comment":"/**\n     * Returns the current width of the drawable: with some types of drawables ({Sprite}),\n     * width can vary\n     *\n     * @returns {number} The current width of the object\n     *\n     * @related {Sprite}\n     */","meta":{"range":[15781,15833],"filename":"Drawable.js","lineno":580,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002817","name":"Drawable#getCurrentWidth","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the current width of the drawable: with some types of drawables ({Sprite}),\nwidth can vary","returns":[{"type":{"names":["number"]},"description":"The current width of the object"}],"tags":[{"originalTitle":"related","title":"related","text":"{Sprite}","value":"{Sprite}"}],"name":"getCurrentWidth","longname":"BitmapText#getCurrentWidth","kind":"function","memberof":"BitmapText","scope":"instance","params":[],"inherits":"Drawable#getCurrentWidth","inherited":true,"$longname":"BitmapText#getCurrentWidth"},{"comment":"/**\n     * Returns the object's hitbox.\n     *\n     * Some drawables (eg. {Sprite} may have different hitbox for different frames.\n     *\n     * @returns {Object} an object with x, y, x2, Y2 describing the hit box\n     */","meta":{"range":[16351,16522],"filename":"Drawable.js","lineno":603,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002833","name":"Drawable#getHitBox","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the object's hitbox.\n\nSome drawables (eg. {Sprite} may have different hitbox for different frames.","returns":[{"type":{"names":["Object"]},"description":"an object with x, y, x2, Y2 describing the hit box"}],"name":"getHitBox","longname":"BitmapText#getHitBox","kind":"function","memberof":"BitmapText","scope":"instance","params":[],"inherits":"Drawable#getHitBox","inherited":true,"$longname":"BitmapText#getHitBox"},{"comment":"/**\n     * Calculates the position and size of each pixel lines to be rendered onto the screen\n     */","meta":{"range":[5067,6354],"filename":"BitmapText.js","lineno":160,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100000358","name":"BitmapText#getLines","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Calculates the position and size of each pixel lines to be rendered onto the screen","name":"getLines","longname":"BitmapText#getLines","kind":"function","memberof":"BitmapText","scope":"instance","params":[],"$longname":"BitmapText#getLines"},{"comment":"/**\n     * Returns the length of a text line, in characters\n     *\n     * @param {String} str The string to mesure.\n     * @param {String} eof The character to use as end of line.\n     *\n     * @returns {Number} The length of the string\n     */","meta":{"range":[4776,4954],"filename":"BitmapText.js","lineno":146,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100000330","name":"BitmapText#getNextLineLength","type":"MethodDefinition","paramnames":["str","eof"]},"vars":{"":null}},"description":"Returns the length of a text line, in characters","params":[{"type":{"names":["String"]},"description":"The string to mesure.","name":"str"},{"type":{"names":["String"]},"description":"The character to use as end of line.","name":"eof"}],"returns":[{"type":{"names":["Number"]},"description":"The length of the string"}],"name":"getNextLineLength","longname":"BitmapText#getNextLineLength","kind":"function","memberof":"BitmapText","scope":"instance","$longname":"BitmapText#getNextLineLength"},{"comment":"/**\n     * Returns the current opacity of the object\n     *\n     * @returns {number} The current opacity value.\n     */","meta":{"range":[8518,8567],"filename":"Drawable.js","lineno":296,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002235","name":"Drawable#getOpacity","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the current opacity of the object","returns":[{"type":{"names":["number"]},"description":"The current opacity value."}],"name":"getOpacity","longname":"BitmapText#getOpacity","kind":"function","memberof":"BitmapText","scope":"instance","params":[],"inherits":"Drawable#getOpacity","inherited":true,"$longname":"BitmapText#getOpacity"},{"comment":"/**\n     * Returns previously seved position\n     *\n     * @returns {Object} The saved position\n     */","meta":{"range":[13162,13271],"filename":"Drawable.js","lineno":455,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002683","name":"Drawable#getSavedPosition","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns previously seved position","returns":[{"type":{"names":["Object"]},"description":"The saved position"}],"name":"getSavedPosition","longname":"BitmapText#getSavedPosition","kind":"function","memberof":"BitmapText","scope":"instance","params":[],"inherits":"Drawable#getSavedPosition","inherited":true,"$longname":"BitmapText#getSavedPosition"},{"comment":"/**\n     * Hides the object\n     *\n     * @returns {Drawable} this\n     */","meta":{"range":[14710,14776],"filename":"Drawable.js","lineno":532,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002759","name":"Drawable#hide","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Hides the object","returns":[{"type":{"names":["Drawable"]},"description":"this"}],"name":"hide","longname":"BitmapText#hide","kind":"function","memberof":"BitmapText","scope":"instance","params":[],"inherits":"Drawable#hide","inherited":true,"$longname":"BitmapText#hide"},{"comment":"/**\n     * Performs collision tests on the specifed object.\n     *\n     * @param {Drawable} obj The object to perform test on\n     *\n     * @returns {Boolean} Returns true if this and obj collide\n     */","meta":{"range":[19080,20353],"filename":"Drawable.js","lineno":678,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003151","name":"Drawable#hitTest","type":"MethodDefinition","paramnames":["obj"]},"vars":{"":null}},"description":"Performs collision tests on the specifed object.","params":[{"type":{"names":["Drawable"]},"description":"The object to perform test on","name":"obj"}],"returns":[{"type":{"names":["Boolean"]},"description":"Returns true if this and obj collide"}],"name":"hitTest","longname":"BitmapText#hitTest","kind":"function","memberof":"BitmapText","scope":"instance","inherits":"Drawable#hitTest","inherited":true,"$longname":"BitmapText#hitTest"},{"comment":"/**\n     * Moves the object to a new destination.\n     *\n     * @param {number} x The new horizontal position.\n     * @param {number} y The new vertical position.\n     * @param {number} [duration=0] The duration of the move, 0 to have the object move immediately to new position.\n     *\n     * @returns {Drawable} this\n     */","meta":{"range":[6272,6991],"filename":"Drawable.js","lineno":217,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001981","name":"Drawable#moveTo","type":"MethodDefinition","paramnames":["x","y","duration"]},"vars":{"":null}},"description":"Moves the object to a new destination.","params":[{"type":{"names":["number"]},"description":"The new horizontal position.","name":"x"},{"type":{"names":["number"]},"description":"The new vertical position.","name":"y"},{"type":{"names":["number"]},"optional":true,"defaultvalue":0,"description":"The duration of the move, 0 to have the object move immediately to new position.","name":"duration"}],"returns":[{"type":{"names":["Drawable"]},"description":"this"}],"name":"moveTo","longname":"BitmapText#moveTo","kind":"function","memberof":"BitmapText","scope":"instance","inherits":"Drawable#moveTo","inherited":true,"$longname":"BitmapText#moveTo"},{"comment":"/**\n     * Sends a notification to listeners\n     *\n     * @note: this is a simple wrapper to the NotificationManageger's notify method\n     *\n     * @param {String} id name of the event to send\n     * @param {Object} data data to send with the event, default = empty object\n     */","meta":{"range":[27760,27836],"filename":"Drawable.js","lineno":973,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003941","name":"Drawable#notify","type":"MethodDefinition","paramnames":["id","data"]},"vars":{"":null}},"description":"Sends a notification to listeners","tags":[{"originalTitle":"note:","title":"note:","text":"this is a simple wrapper to the NotificationManageger's notify method","value":"this is a simple wrapper to the NotificationManageger's notify method"}],"params":[{"type":{"names":["String"]},"description":"name of the event to send","name":"id"},{"type":{"names":["Object"]},"description":"data to send with the event, default = empty object","name":"data"}],"name":"notify","longname":"BitmapText#notify","kind":"function","memberof":"BitmapText","scope":"instance","inherits":"Drawable#notify","inherited":true,"$longname":"BitmapText#notify"},{"comment":"/**\n     * onCollision is called on each collision with the object.\n     *\n     * This method does nothing and should be extended if needed.\n     *\n     */","meta":{"range":[24683,24705],"filename":"Drawable.js","lineno":864,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003687","name":"Drawable#onCollision","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"onCollision is called on each collision with the object.\n\nThis method does nothing and should be extended if needed.","name":"onCollision","longname":"BitmapText#onCollision","kind":"function","memberof":"BitmapText","scope":"instance","params":[],"inherits":"Drawable#onCollision","inherited":true,"$longname":"BitmapText#onCollision"},{"comment":"/**\n     * onHit is called when the object collides with another object\n     *\n     * @param {Drawable} obj The object that collided.\n     *\n     * This function does nothing interesting: this should be extended if needed.\n     */","meta":{"range":[21068,21203],"filename":"Drawable.js","lineno":742,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003419","name":"Drawable#onHit","type":"MethodDefinition","paramnames":["obj"]},"vars":{"":null}},"description":"onHit is called when the object collides with another object","params":[{"type":{"names":["Drawable"]},"description":"The object that collided.\n\nThis function does nothing interesting: this should be extended if needed.","name":"obj"}],"name":"onHit","longname":"BitmapText#onHit","kind":"function","memberof":"BitmapText","scope":"instance","inherits":"Drawable#onHit","inherited":true,"$longname":"BitmapText#onHit"},{"comment":"/**\n     * Plays the spcified sound\n     *\n     * @param {String} id The id of the sound to play.\n     * @param {Object} options\n     * @param {Boolean} [options.pan=true] Set pan to true if you want to use panning.\n     * @param {Boolean} [options.loop=false] Set to true to loop the sound.\n     */","meta":{"range":[26781,27467],"filename":"Drawable.js","lineno":943,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003823","name":"Drawable#playSound","type":"MethodDefinition","paramnames":["id","options"]},"vars":{"":null}},"description":"Plays the spcified sound","params":[{"type":{"names":["String"]},"description":"The id of the sound to play.","name":"id"},{"type":{"names":["Object"]},"name":"options"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":true,"description":"Set pan to true if you want to use panning.","name":"options.pan"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"Set to true to loop the sound.","name":"options.loop"}],"name":"playSound","longname":"BitmapText#playSound","kind":"function","memberof":"BitmapText","scope":"instance","inherits":"Drawable#playSound","inherited":true,"$longname":"BitmapText#playSound"},{"comment":"/**\n     * Remove every children from the object.\n     */","meta":{"range":[25612,25780],"filename":"Drawable.js","lineno":903,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003759","name":"Drawable#removeAllChildren","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Remove every children from the object.","name":"removeAllChildren","longname":"BitmapText#removeAllChildren","kind":"function","memberof":"BitmapText","scope":"instance","params":[],"inherits":"Drawable#removeAllChildren","inherited":true,"$longname":"BitmapText#removeAllChildren"},{"comment":"/**\n     * Remove a child from the object\n     *\n     * @param {Drawable} child The child to remove from the object.\n     *\n     * @note: removing a child object will call its `destroy` method.\n     */","meta":{"range":[25351,25544],"filename":"Drawable.js","lineno":891,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003720","name":"Drawable#removeChild","type":"MethodDefinition","paramnames":["child"]},"vars":{"":null}},"description":"Remove a child from the object","params":[{"type":{"names":["Drawable"]},"description":"The child to remove from the object.","name":"child"}],"tags":[{"originalTitle":"note:","title":"note:","text":"removing a child object will call its `destroy` method.","value":"removing a child object will call its `destroy` method."}],"name":"removeChild","longname":"BitmapText#removeChild","kind":"function","memberof":"BitmapText","scope":"instance","inherits":"Drawable#removeChild","inherited":true,"$longname":"BitmapText#removeChild"},{"comment":"/**\n     * Pre-renders text from this.textArray into the internal buffer\n     *\n     */","meta":{"range":[11787,12021],"filename":"BitmapText.js","lineno":368,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001004","name":"BitmapText#renderText","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Pre-renders text from this.textArray into the internal buffer","name":"renderText","longname":"BitmapText#renderText","kind":"function","memberof":"BitmapText","scope":"instance","params":[],"$longname":"BitmapText#renderText"},{"comment":"/**\n     * User customized reset method\n     */","meta":{"range":[3584,3600],"filename":"Drawable.js","lineno":119,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001682","name":"Drawable#reset","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"User customized reset method","name":"reset","longname":"BitmapText#reset","kind":"function","memberof":"BitmapText","scope":"instance","params":[],"inherits":"Drawable#reset","inherited":true,"$longname":"BitmapText#reset"},{"comment":"/**\n     * Restores the previous context globalAlpha property.\n     *\n     * @param {RenderingContext} ctx The context.\n     */","meta":{"range":[15480,15550],"filename":"Drawable.js","lineno":568,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002804","name":"Drawable#restoreCtxAlpha","type":"MethodDefinition","paramnames":["ctx"]},"vars":{"":null}},"description":"Restores the previous context globalAlpha property.","params":[{"type":{"names":["RenderingContext"]},"description":"The context.","name":"ctx"}],"name":"restoreCtxAlpha","longname":"BitmapText#restoreCtxAlpha","kind":"function","memberof":"BitmapText","scope":"instance","inherits":"Drawable#restoreCtxAlpha","inherited":true,"$longname":"BitmapText#restoreCtxAlpha"},{"comment":"/**\n     * Saves current object position into `savedX` and `savedY` properties\n     */","meta":{"range":[12966,13048],"filename":"Drawable.js","lineno":445,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002663","name":"Drawable#savePosition","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Saves current object position into `savedX` and `savedY` properties","name":"savePosition","longname":"BitmapText#savePosition","kind":"function","memberof":"BitmapText","scope":"instance","params":[],"inherits":"Drawable#savePosition","inherited":true,"$longname":"BitmapText#savePosition"},{"comment":"/**\n     * Scrolls text from the bottom to the top, firing an optional callback at the end\n     *\n     * @param {Number} The duration of the scrolling in milliseconds.\n     * @param {Function} [callback=undefined] An optional callback to fire when the scrolling is over.\n     */","meta":{"range":[6643,6958],"filename":"BitmapText.js","lineno":208,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100000535","name":"BitmapText#scrollFromBottom","type":"MethodDefinition","paramnames":["duration","callback"]},"vars":{"":null}},"description":"Scrolls text from the bottom to the top, firing an optional callback at the end","params":[{"type":{"names":["Number"]},"description":"duration of the scrolling in milliseconds.","name":"The"},{"type":{"names":["function"]},"optional":true,"description":"An optional callback to fire when the scrolling is over.","name":"callback"}],"name":"scrollFromBottom","longname":"BitmapText#scrollFromBottom","kind":"function","memberof":"BitmapText","scope":"instance","$longname":"BitmapText#scrollFromBottom"},{"comment":"/**\n     * Scrolls text from the top, firing an optional callback at the end\n     *\n     * @param {Number} duration The duration of the scrolling in milliseconds.\n     * @param {Function} [callback=undefined] An optional callback to fire when the scrolling is over.\n     */","meta":{"range":[7242,7531],"filename":"BitmapText.js","lineno":226,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100000569","name":"BitmapText#scrollFromTop","type":"MethodDefinition","paramnames":["duration","callback"]},"vars":{"":null}},"description":"Scrolls text from the top, firing an optional callback at the end","params":[{"type":{"names":["Number"]},"description":"The duration of the scrolling in milliseconds.","name":"duration"},{"type":{"names":["function"]},"optional":true,"description":"An optional callback to fire when the scrolling is over.","name":"callback"}],"name":"scrollFromTop","longname":"BitmapText#scrollFromTop","kind":"function","memberof":"BitmapText","scope":"instance","$longname":"BitmapText#scrollFromTop"},{"comment":"/**\n     * Change the angle of an object\n     *\n     * @param {number} angle The new angle of the object. 0 < angle < 360.\n     *\n     * @note This property is only used for the rendering and it's ignored for collisions.\n     */","meta":{"range":[14109,14207],"filename":"Drawable.js","lineno":500,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002723","name":"Drawable#setAngle","type":"MethodDefinition","paramnames":["angle"]},"vars":{"":null}},"description":"Change the angle of an object","params":[{"type":{"names":["number"]},"description":"The new angle of the object. 0 < angle < 360.","name":"angle"}],"tags":[{"originalTitle":"note","title":"note","text":"This property is only used for the rendering and it's ignored for collisions.","value":"This property is only used for the rendering and it's ignored for collisions."}],"name":"setAngle","longname":"BitmapText#setAngle","kind":"function","memberof":"BitmapText","scope":"instance","inherits":"Drawable#setAngle","inherited":true,"$longname":"BitmapText#setAngle"},{"comment":"/**\n     * Sets a new behavior to the object: this will be called in the move loop\n     *\n     * @param {(String|Behavior)} behavior Either the name of a standard behavior or a Behavior class to use.\n     * @param {Object} [options={}] The options of the behavior (may depend on the behavior type).\n     *\n     * @related {Behavior}\n     */","meta":{"range":[9643,9896],"filename":"Drawable.js","lineno":336,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002322","name":"Drawable#setBehavior","type":"MethodDefinition","paramnames":["behavior","options"]},"vars":{"":null}},"description":"Sets a new behavior to the object: this will be called in the move loop","params":[{"type":{"names":["String","Behavior"]},"description":"Either the name of a standard behavior or a Behavior class to use.","name":"behavior"},{"type":{"names":["Object"]},"optional":true,"defaultvalue":"{}","description":"The options of the behavior (may depend on the behavior type).","name":"options"}],"tags":[{"originalTitle":"related","title":"related","text":"{Behavior}","value":"{Behavior}"}],"name":"setBehavior","longname":"BitmapText#setBehavior","kind":"function","memberof":"BitmapText","scope":"instance","inherits":"Drawable#setBehavior","inherited":true,"$longname":"BitmapText#setBehavior"},{"comment":"/**\n     * Sets bitmapText properties using options\n     *\n     * @param {Object} options\n     */","meta":{"range":[3509,4132],"filename":"BitmapText.js","lineno":108,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100000203","name":"BitmapText#setFontParams","type":"MethodDefinition","paramnames":["options"]},"vars":{"":null}},"description":"Sets bitmapText properties using options","params":[{"type":{"names":["Object"]},"name":"options"}],"name":"setFontParams","longname":"BitmapText#setFontParams","kind":"function","memberof":"BitmapText","scope":"instance","$longname":"BitmapText#setFontParams"},{"comment":"/**\n     * Changes the image to use as spritesheet\n     *\n     * @param {Image} image The new {image} to use as source.\n     */","meta":{"range":[12673,12879],"filename":"BitmapText.js","lineno":407,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001092","name":"BitmapText#setImage","type":"MethodDefinition","paramnames":["image"]},"vars":{"":null}},"description":"Changes the image to use as spritesheet","params":[{"type":{"names":["Image"]},"description":"The new {image} to use as source.","name":"image"}],"name":"setImage","longname":"BitmapText#setImage","kind":"function","memberof":"BitmapText","scope":"instance","overrides":"Drawable#setImage","$longname":"BitmapText#setImage"},{"comment":"/**\n     * Sets the map of the object.\n     *\n     * @param {Map} map The map of the object.\n     *\n     * @note you don't usually need to call this method as it's called automatically when adding an object\n     * onto a map.\n     *\n     */","meta":{"range":[5146,5283],"filename":"Drawable.js","lineno":176,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001916","name":"Drawable#setMap","type":"MethodDefinition","paramnames":["map"]},"vars":{"":null}},"description":"Sets the map of the object.","params":[{"type":{"names":["Map"]},"description":"The map of the object.","name":"map"}],"tags":[{"originalTitle":"note","title":"note","text":"you don't usually need to call this method as it's called automatically when adding an object\nonto a map.","value":"you don't usually need to call this method as it's called automatically when adding an object\nonto a map."}],"name":"setMap","longname":"BitmapText#setMap","kind":"function","memberof":"BitmapText","scope":"instance","inherits":"Drawable#setMap","inherited":true,"$longname":"BitmapText#setMap"},{"comment":"/**\n     * Applies a new mask to the object, clipping its drawing onto the scene/map\n     *\n     * @param {Object} mask The new mask to use, set to null to remove the mask.\n     * @param {Boolean} exclude Set to true to have the mask exclude portions of the drawing, in this case mask.color will be used.\n     */","meta":{"range":[8066,8211],"filename":"Drawable.js","lineno":275,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002197","name":"Drawable#setMask","type":"MethodDefinition","paramnames":["mask","exclude"]},"vars":{"":null}},"description":"Applies a new mask to the object, clipping its drawing onto the scene/map","params":[{"type":{"names":["Object"]},"description":"The new mask to use, set to null to remove the mask.","name":"mask","defaultvalue":null},{"type":{"names":["Boolean"]},"description":"Set to true to have the mask exclude portions of the drawing, in this case mask.color will be used.","name":"exclude","defaultvalue":false}],"name":"setMask","longname":"BitmapText#setMask","kind":"function","memberof":"BitmapText","scope":"instance","inherits":"Drawable#setMask","inherited":true,"$longname":"BitmapText#setMask"},{"comment":"/**\n     * Changes the opacity of the object\n     *\n     * @param {number} opacity The new opacity.\n     */","meta":{"range":[8329,8388],"filename":"Drawable.js","lineno":287,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002224","name":"Drawable#setOpacity","type":"MethodDefinition","paramnames":["opacity"]},"vars":{"":null}},"description":"Changes the opacity of the object","params":[{"type":{"names":["number"]},"description":"The new opacity.","name":"opacity"}],"name":"setOpacity","longname":"BitmapText#setOpacity","kind":"function","memberof":"BitmapText","scope":"instance","inherits":"Drawable#setOpacity","inherited":true,"$longname":"BitmapText#setOpacity"},{"comment":"/**\n     * Sets a new path for the object\n     *\n     * @param {Path} path The new path that the object will use when moving.\n     *\n     * @related {Path}\n     */","meta":{"range":[13547,13594],"filename":"Drawable.js","lineno":478,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002701","name":"Drawable#setPath","type":"MethodDefinition","paramnames":["path"]},"vars":{"":null}},"description":"Sets a new path for the object","params":[{"type":{"names":["Path"]},"description":"The new path that the object will use when moving.","name":"path"}],"tags":[{"originalTitle":"related","title":"related","text":"{Path}","value":"{Path}"}],"name":"setPath","longname":"BitmapText#setPath","kind":"function","memberof":"BitmapText","scope":"instance","inherits":"Drawable#setPath","inherited":true,"$longname":"BitmapText#setPath"},{"comment":"/**\n     * WIP Sets the platform of the object. This will be used when platforms will be fully implemented.\n     *\n     * @param {Drawable} platform The platform the object is attached to.\n     */","meta":{"range":[5872,5935],"filename":"Drawable.js","lineno":204,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001970","name":"Drawable#setPlatform","type":"MethodDefinition","paramnames":["platform"]},"vars":{"":null}},"description":"WIP Sets the platform of the object. This will be used when platforms will be fully implemented.","params":[{"type":{"names":["Drawable"]},"description":"The platform the object is attached to.","name":"platform"}],"name":"setPlatform","longname":"BitmapText#setPlatform","kind":"function","memberof":"BitmapText","scope":"instance","inherits":"Drawable#setPlatform","inherited":true,"$longname":"BitmapText#setPlatform"},{"comment":"/**\n     * Change the scale of the object\n     *\n     * @param {number} scale The new scale of the object.\n     *\n     * @note: it's only used when rendering, collision detection is not using the scale yet.\n     */","meta":{"range":[13819,13870],"filename":"Drawable.js","lineno":489,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002712","name":"Drawable#setScale","type":"MethodDefinition","paramnames":["scale"]},"vars":{"":null}},"description":"Change the scale of the object","params":[{"type":{"names":["number"]},"description":"The new scale of the object.","name":"scale"}],"tags":[{"originalTitle":"note:","title":"note:","text":"it's only used when rendering, collision detection is not using the scale yet.","value":"it's only used when rendering, collision detection is not using the scale yet."}],"name":"setScale","longname":"BitmapText#setScale","kind":"function","memberof":"BitmapText","scope":"instance","inherits":"Drawable#setScale","inherited":true,"$longname":"BitmapText#setScale"},{"comment":"/**\n     * Sets the scene of the bitmap font\n     *\n     * @param {Scene} scene The scene to use.\n     */","meta":{"range":[12995,13083],"filename":"BitmapText.js","lineno":421,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001121","name":"BitmapText#setScene","type":"MethodDefinition","paramnames":["scene"]},"vars":{"":null}},"description":"Sets the scene of the bitmap font","params":[{"type":{"names":["Scene"]},"description":"The scene to use.","name":"scene"}],"name":"setScene","longname":"BitmapText#setScene","kind":"function","memberof":"BitmapText","scope":"instance","overrides":"Drawable#setScene","$longname":"BitmapText#setScene"},{"comment":"/**\n     * Changes the text of the sprite, calculates every line size, and renders it into\n     * the internal buffer\n     *\n     * @param {String} text The new text to use\n     */","meta":{"range":[12212,12535],"filename":"BitmapText.js","lineno":387,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001049","name":"BitmapText#setText","type":"MethodDefinition","paramnames":["text"]},"vars":{"":null}},"description":"Changes the text of the sprite, calculates every line size, and renders it into\nthe internal buffer","params":[{"type":{"names":["String"]},"description":"The new text to use","name":"text"}],"name":"setText","longname":"BitmapText#setText","kind":"function","memberof":"BitmapText","scope":"instance","$longname":"BitmapText#setText"},{"comment":"/**\n     * Show the object\n     *\n     * @returns {Drawable} this\n     */","meta":{"range":[14860,14925],"filename":"Drawable.js","lineno":543,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002771","name":"Drawable#show","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Show the object","returns":[{"type":{"names":["Drawable"]},"description":"this"}],"name":"show","longname":"BitmapText#show","kind":"function","memberof":"BitmapText","scope":"instance","params":[],"inherits":"Drawable#show","inherited":true,"$longname":"BitmapText#show"},{"comment":"/**\n     * Draws the sprite hit box\n     *\n     * @param {RenderingContext} The canvas context where to render the hitbox.\n     */","meta":{"range":[16663,18176],"filename":"Drawable.js","lineno":617,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002857","name":"Drawable#showHitBox","type":"MethodDefinition","paramnames":["ctx"]},"vars":{"":null}},"description":"Draws the sprite hit box","params":[{"type":{"names":["RenderingContext"]},"description":"canvas context where to render the hitbox.","name":"The"}],"name":"showHitBox","longname":"BitmapText#showHitBox","kind":"function","memberof":"BitmapText","scope":"instance","inherits":"Drawable#showHitBox","inherited":true,"$longname":"BitmapText#showHitBox"},{"comment":"/**\n       * Draws a box around objects. This method is called when debugging is enabled.\n       *\n       * @param {RenderingContext} ctx The context where to draw the box.\n       */","meta":{"range":[18369,18743],"filename":"Drawable.js","lineno":656,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003054","name":"Drawable#showObjectBox","type":"MethodDefinition","paramnames":["ctx"]},"vars":{"":null}},"description":"Draws a box around objects. This method is called when debugging is enabled.","params":[{"type":{"names":["RenderingContext"]},"description":"The context where to draw the box.","name":"ctx"}],"name":"showObjectBox","longname":"BitmapText#showObjectBox","kind":"function","memberof":"BitmapText","scope":"instance","inherits":"Drawable#showObjectBox","inherited":true,"$longname":"BitmapText#showObjectBox"},{"comment":"/**\n     * Moves the object by snapping it to the map tiles\n     *\n     * @param {Boolean} isLeft Should we snap to the left?\n     * @param {Boolean} isUp Should we snap to the right?\n     */","meta":{"range":[7193,7743],"filename":"Drawable.js","lineno":248,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002106","name":"Drawable#snapToMap","type":"MethodDefinition","paramnames":["isLeft","isUp"]},"vars":{"":null}},"description":"Moves the object by snapping it to the map tiles","params":[{"type":{"names":["Boolean"]},"description":"Should we snap to the left?","name":"isLeft"},{"type":{"names":["Boolean"]},"description":"Should we snap to the right?","name":"isUp"}],"name":"snapToMap","longname":"BitmapText#snapToMap","kind":"function","memberof":"BitmapText","scope":"instance","inherits":"Drawable#snapToMap","inherited":true,"$longname":"BitmapText#snapToMap"},{"comment":"/**\n     * Stops current running animation\n     *\n     * In some cases, the game may need to stop effects from running before\n     * they are completed. This method proves a way to do so and set an end value.\n     *\n     * @param {any} setEndValue The end value of the animation.\n     */","meta":{"range":[23545,23877],"filename":"Drawable.js","lineno":821,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003608","name":"Drawable#stopAnimate","type":"MethodDefinition","paramnames":["setEndValue"]},"vars":{"":null}},"description":"Stops current running animation\n\nIn some cases, the game may need to stop effects from running before\nthey are completed. This method proves a way to do so and set an end value.","params":[{"type":{"names":["any"]},"description":"The end value of the animation.","name":"setEndValue"}],"name":"stopAnimate","longname":"BitmapText#stopAnimate","kind":"function","memberof":"BitmapText","scope":"instance","inherits":"Drawable#stopAnimate","inherited":true,"$longname":"BitmapText#stopAnimate"},{"comment":"/**\n     * update() is called at each render loop and calculates the next position during a scrolling\n     */","meta":{"range":[9058,9884],"filename":"BitmapText.js","lineno":284,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100000723","name":"BitmapText#update","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"update() is called at each render loop and calculates the next position during a scrolling","name":"update","longname":"BitmapText#update","kind":"function","memberof":"BitmapText","scope":"instance","params":[],"overrides":"Drawable#update","$longname":"BitmapText#update"}],"$constructor":{"comment":"/**\n     * Creates a new BitmapText Drawable\n     * \n     * @param {String} [type='BitmapText'] The type of the sprite.\n     * @param {Object} options The options describing the BitmapText.\n     * @param {String} options.imageId The path to the spritesheet file.\n     * @param {Number} [options.charWidth] The width of a character in pixels.\n     * @param {Number} [options.charHeight] The height of a character in pixels.\n     * @param {String} [options.characters] The list of supported characters in the spritesheet\n     * @param {Number} [options.offsetX=charWidth] The full width of the character (including spaces) inside the spritesheet\n     * @param {Number} [options.letterSpacing=2] The space between each drawn character (in pixels).\n     * @param {Number} [options.startY=0] The optinal vertical offset at which to start getting bitmap characters.\n     * @param {Number} [options.startX=0] The optinal hoeizontal offset at which to start getting bitmap characters.\n     *\n     * @note the charset is limited to a subset of ascii right now: a-z 0-9\n     * @example\n     *\n     *  let myFont = new BitmapText('myFont', {\n     *      charWidth: 18,\n     *      charHeight: 18,\n     *      imageId: 'font'\n     *      offsetX: 34,\n     *      startY: 36\n     *   });\n     *\n     */","meta":{"range":[1521,2819],"filename":"BitmapText.js","lineno":36,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100000014","name":"BitmapText","type":"MethodDefinition","paramnames":["type","options"]},"vars":{"":null}},"description":"Creates a new BitmapText Drawable","params":[{"type":{"names":["String"]},"optional":true,"defaultvalue":"'BitmapText'","description":"The type of the sprite.","name":"type"},{"type":{"names":["Object"]},"description":"The options describing the BitmapText.","name":"options"},{"type":{"names":["String"]},"description":"The path to the spritesheet file.","name":"options.imageId"},{"type":{"names":["Number"]},"optional":true,"description":"The width of a character in pixels.","name":"options.charWidth"},{"type":{"names":["Number"]},"optional":true,"description":"The height of a character in pixels.","name":"options.charHeight"},{"type":{"names":["String"]},"optional":true,"description":"The list of supported characters in the spritesheet","name":"options.characters"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":"charWidth","description":"The full width of the character (including spaces) inside the spritesheet","name":"options.offsetX"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":2,"description":"The space between each drawn character (in pixels).","name":"options.letterSpacing"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"The optinal vertical offset at which to start getting bitmap characters.","name":"options.startY"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"The optinal hoeizontal offset at which to start getting bitmap characters.","name":"options.startX"}],"tags":[{"originalTitle":"note","title":"note","text":"the charset is limited to a subset of ascii right now: a-z 0-9","value":"the charset is limited to a subset of ascii right now: a-z 0-9"}],"examples":["let myFont = new BitmapText('myFont', {\n     charWidth: 18,\n     charHeight: 18,\n     imageId: 'font'\n     offsetX: 34,\n     startY: 36\n  });"],"name":"BitmapText","longname":"BitmapText","kind":"class","scope":"global","undocumented":true,"$longname":"BitmapText"}},{"comment":"/**\n * `Drawable` is the base class for objects that can be rendered on the screen.\n *\n * A `Drawable` has properties like x, y, vx, vy, speed.\n * In order to be rendered, an object must be added onto the active scene/map.\n * It can also have an optional behavior which tells Athena how\n * to move an object at each frame.\n *\n */","meta":{"range":[578,28638],"filename":"Drawable.js","lineno":17,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001390","name":"Drawable","type":"ClassDeclaration","paramnames":["type","options"]}},"classdesc":"`Drawable` is the base class for objects that can be rendered on the screen.\n\nA `Drawable` has properties like x, y, vx, vy, speed.\nIn order to be rendered, an object must be added onto the active scene/map.\nIt can also have an optional behavior which tells Athena how\nto move an object at each frame.","name":"Drawable","longname":"Drawable","kind":"class","scope":"global","description":"Creates a new Drawable: this class should be extended before creating an instance","params":[{"type":{"names":["String"]},"description":"The type of object: this describes the type of object","name":"type"},{"type":{"names":["Object"]},"name":"options"},{"type":{"names":["String"]},"optional":true,"description":"The id of the object. The defaults is type + random timestamp.","name":"options.objectId"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"The type of collision to use for the object.","name":"options.collideGroup"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"Set to true if the object should be the master.","name":"options.master"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":true,"description":"An invisible object isn't rendered onto the screen.","name":"options.visible"}],"$longname":"Drawable","$members":[{"comment":"/**\n     * Add a new Child to the object.\n     *\n     * Childs are automatically rendered and moved when the parent object is.\n     *\n     * @param {Drawable} child The child to add.\n     *\n     * @note children are automatically added to the scene/map of the parent object.\n     */","meta":{"range":[24998,25139],"filename":"Drawable.js","lineno":877,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003691","name":"Drawable#addChild","type":"MethodDefinition","paramnames":["child"]},"vars":{"":null}},"description":"Add a new Child to the object.\n\nChilds are automatically rendered and moved when the parent object is.","params":[{"type":{"names":["Drawable"]},"description":"The child to add.","name":"child"}],"tags":[{"originalTitle":"note","title":"note","text":"children are automatically added to the scene/map of the parent object.","value":"children are automatically added to the scene/map of the parent object."}],"name":"addChild","longname":"Drawable#addChild","kind":"function","memberof":"Drawable","scope":"instance","$longname":"Drawable#addChild"},{"comment":"/**\n     * Add a new handler to be called after each move of the object\n     *\n     * @param {Function} cb The callback to add.\n     */","meta":{"range":[20765,20827],"filename":"Drawable.js","lineno":731,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003406","name":"Drawable#addMoveHandler","type":"MethodDefinition","paramnames":["cb"]},"vars":{"":null}},"description":"Add a new handler to be called after each move of the object","params":[{"type":{"names":["function"]},"description":"The callback to add.","name":"cb"}],"name":"addMoveHandler","longname":"Drawable#addMoveHandler","kind":"function","memberof":"Drawable","scope":"instance","$longname":"Drawable#addMoveHandler"},{"comment":"/**\n     * Performs an animation on the object using one of the defined {FX} effects\n     *\n     * Effects change the object size/position using an interpolation function.\n     *\n     * Athena has the following effects:\n     * - {Fade} performs a fade\n     * - {Mosaic} performs a SNES-like mosaic effect\n     * - {Rotate} performs a rotation on the object\n     *\n     * @param {String} fxName The name of the effect to use.\n     * @param {Object} options The options of the effect.\n     * @param {String} [options.easing=\"linear\"] The easing functions to use, can be: 'linear', 'swing', 'easeInQuad', 'easeOutBounce'.\n     *\n     * @returns {Promise} a promise that will be fullfilled when the effect has been completed\n     */","meta":{"range":[22444,23247],"filename":"Drawable.js","lineno":787,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003490","name":"Drawable#animate","type":"MethodDefinition","paramnames":["fxName","options"]},"vars":{"":null}},"description":"Performs an animation on the object using one of the defined {FX} effects\n\nEffects change the object size/position using an interpolation function.\n\nAthena has the following effects:\n- {Fade} performs a fade\n- {Mosaic} performs a SNES-like mosaic effect\n- {Rotate} performs a rotation on the object","params":[{"type":{"names":["String"]},"description":"The name of the effect to use.","name":"fxName"},{"type":{"names":["Object"]},"description":"The options of the effect.","name":"options"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"linear\"","description":"The easing functions to use, can be: 'linear', 'swing', 'easeInQuad', 'easeOutBounce'.","name":"options.easing"}],"returns":[{"type":{"names":["Promise"]},"description":"a promise that will be fullfilled when the effect has been completed"}],"name":"animate","longname":"Drawable#animate","kind":"function","memberof":"Drawable","scope":"instance","$longname":"Drawable#animate"},{"comment":"/**\n     * Stops the object from moving, optionnaly immediately going to target position\n     *\n     * @param {Boolean} [gotoTarget=false] Set to true to go to the target position.\n     */","meta":{"range":[8766,8998],"filename":"Drawable.js","lineno":305,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002243","name":"Drawable#cancelMoveTo","type":"MethodDefinition","paramnames":["gotoTarget"]},"vars":{"":null}},"description":"Stops the object from moving, optionnaly immediately going to target position","params":[{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"Set to true to go to the target position.","name":"gotoTarget"}],"name":"cancelMoveTo","longname":"Drawable#cancelMoveTo","kind":"function","memberof":"Drawable","scope":"instance","$longname":"Drawable#cancelMoveTo"},{"comment":"/**\n     * Centers the object into the scene.\n     *\n     * @returns {Drawable} this\n     */","meta":{"range":[9101,9292],"filename":"Drawable.js","lineno":320,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002280","name":"Drawable#center","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Centers the object into the scene.","returns":[{"type":{"names":["Drawable"]},"description":"this"}],"name":"center","longname":"Drawable#center","kind":"function","memberof":"Drawable","scope":"instance","params":[],"$longname":"Drawable#center"},{"comment":"/**\n     * Stop using a particular behavior.\n     *\n     * The vx and vy properties of the object will be set to zero.\n     */","meta":{"range":[10033,10117],"filename":"Drawable.js","lineno":349,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002359","name":"Drawable#clearBehavior","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Stop using a particular behavior.\n\nThe vx and vy properties of the object will be set to zero.","name":"clearBehavior","longname":"Drawable#clearBehavior","kind":"function","memberof":"Drawable","scope":"instance","params":[],"$longname":"Drawable#clearBehavior"},{"comment":"/**\n     * Destroy is called when an object is removed from a scene or object\n     *\n     * @note calling destroy on a parent will automatically call the destroy method of each child.\n     */","meta":{"range":[28118,28636],"filename":"Drawable.js","lineno":984,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003963","name":"Drawable#destroy","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Destroy is called when an object is removed from a scene or object","tags":[{"originalTitle":"note","title":"note","text":"calling destroy on a parent will automatically call the destroy method of each child.","value":"calling destroy on a parent will automatically call the destroy method of each child."}],"name":"destroy","longname":"Drawable#destroy","kind":"function","memberof":"Drawable","scope":"instance","params":[],"$longname":"Drawable#destroy"},{"comment":"/**\n     * Returns the angle property of the object.\n     * \n     * @returns {Number} The angle of the object\n     */","meta":{"range":[14335,14380],"filename":"Drawable.js","lineno":510,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002734","name":"Drawable#getAngle","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the angle property of the object.","returns":[{"type":{"names":["Number"]},"description":"The angle of the object"}],"name":"getAngle","longname":"Drawable#getAngle","kind":"function","memberof":"Drawable","scope":"instance","params":[],"$longname":"Drawable#getAngle"},{"comment":"/**\n     * Returns the current height of the object: with some types of Drawables ({Sprite}),\n     * height can vary\n     *\n     * @returns {number} The current height of the object\n     *\n     * @related {Sprite}\n     */","meta":{"range":[16065,16119],"filename":"Drawable.js","lineno":592,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002825","name":"Drawable#getCurrentHeight","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the current height of the object: with some types of Drawables ({Sprite}),\nheight can vary","returns":[{"type":{"names":["number"]},"description":"The current height of the object"}],"tags":[{"originalTitle":"related","title":"related","text":"{Sprite}","value":"{Sprite}"}],"name":"getCurrentHeight","longname":"Drawable#getCurrentHeight","kind":"function","memberof":"Drawable","scope":"instance","params":[],"$longname":"Drawable#getCurrentHeight"},{"comment":"/**\n     * Returns the current width of the drawable: with some types of drawables ({Sprite}),\n     * width can vary\n     *\n     * @returns {number} The current width of the object\n     *\n     * @related {Sprite}\n     */","meta":{"range":[15781,15833],"filename":"Drawable.js","lineno":580,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002817","name":"Drawable#getCurrentWidth","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the current width of the drawable: with some types of drawables ({Sprite}),\nwidth can vary","returns":[{"type":{"names":["number"]},"description":"The current width of the object"}],"tags":[{"originalTitle":"related","title":"related","text":"{Sprite}","value":"{Sprite}"}],"name":"getCurrentWidth","longname":"Drawable#getCurrentWidth","kind":"function","memberof":"Drawable","scope":"instance","params":[],"$longname":"Drawable#getCurrentWidth"},{"comment":"/**\n     * Returns the object's hitbox.\n     *\n     * Some drawables (eg. {Sprite} may have different hitbox for different frames.\n     *\n     * @returns {Object} an object with x, y, x2, Y2 describing the hit box\n     */","meta":{"range":[16351,16522],"filename":"Drawable.js","lineno":603,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002833","name":"Drawable#getHitBox","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the object's hitbox.\n\nSome drawables (eg. {Sprite} may have different hitbox for different frames.","returns":[{"type":{"names":["Object"]},"description":"an object with x, y, x2, Y2 describing the hit box"}],"name":"getHitBox","longname":"Drawable#getHitBox","kind":"function","memberof":"Drawable","scope":"instance","params":[],"$longname":"Drawable#getHitBox"},{"comment":"/**\n     * Returns the current opacity of the object\n     *\n     * @returns {number} The current opacity value.\n     */","meta":{"range":[8518,8567],"filename":"Drawable.js","lineno":296,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002235","name":"Drawable#getOpacity","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the current opacity of the object","returns":[{"type":{"names":["number"]},"description":"The current opacity value."}],"name":"getOpacity","longname":"Drawable#getOpacity","kind":"function","memberof":"Drawable","scope":"instance","params":[],"$longname":"Drawable#getOpacity"},{"comment":"/**\n     * Returns previously seved position\n     *\n     * @returns {Object} The saved position\n     */","meta":{"range":[13162,13271],"filename":"Drawable.js","lineno":455,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002683","name":"Drawable#getSavedPosition","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns previously seved position","returns":[{"type":{"names":["Object"]},"description":"The saved position"}],"name":"getSavedPosition","longname":"Drawable#getSavedPosition","kind":"function","memberof":"Drawable","scope":"instance","params":[],"$longname":"Drawable#getSavedPosition"},{"comment":"/**\n     * Hides the object\n     *\n     * @returns {Drawable} this\n     */","meta":{"range":[14710,14776],"filename":"Drawable.js","lineno":532,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002759","name":"Drawable#hide","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Hides the object","returns":[{"type":{"names":["Drawable"]},"description":"this"}],"name":"hide","longname":"Drawable#hide","kind":"function","memberof":"Drawable","scope":"instance","params":[],"$longname":"Drawable#hide"},{"comment":"/**\n     * Performs collision tests on the specifed object.\n     *\n     * @param {Drawable} obj The object to perform test on\n     *\n     * @returns {Boolean} Returns true if this and obj collide\n     */","meta":{"range":[19080,20353],"filename":"Drawable.js","lineno":678,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003151","name":"Drawable#hitTest","type":"MethodDefinition","paramnames":["obj"]},"vars":{"":null}},"description":"Performs collision tests on the specifed object.","params":[{"type":{"names":["Drawable"]},"description":"The object to perform test on","name":"obj"}],"returns":[{"type":{"names":["Boolean"]},"description":"Returns true if this and obj collide"}],"name":"hitTest","longname":"Drawable#hitTest","kind":"function","memberof":"Drawable","scope":"instance","$longname":"Drawable#hitTest"},{"comment":"/**\n     * Moves the object to a new destination.\n     *\n     * @param {number} x The new horizontal position.\n     * @param {number} y The new vertical position.\n     * @param {number} [duration=0] The duration of the move, 0 to have the object move immediately to new position.\n     *\n     * @returns {Drawable} this\n     */","meta":{"range":[6272,6991],"filename":"Drawable.js","lineno":217,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001981","name":"Drawable#moveTo","type":"MethodDefinition","paramnames":["x","y","duration"]},"vars":{"":null}},"description":"Moves the object to a new destination.","params":[{"type":{"names":["number"]},"description":"The new horizontal position.","name":"x"},{"type":{"names":["number"]},"description":"The new vertical position.","name":"y"},{"type":{"names":["number"]},"optional":true,"defaultvalue":0,"description":"The duration of the move, 0 to have the object move immediately to new position.","name":"duration"}],"returns":[{"type":{"names":["Drawable"]},"description":"this"}],"name":"moveTo","longname":"Drawable#moveTo","kind":"function","memberof":"Drawable","scope":"instance","$longname":"Drawable#moveTo"},{"comment":"/**\n     * Sends a notification to listeners\n     *\n     * @note: this is a simple wrapper to the NotificationManageger's notify method\n     *\n     * @param {String} id name of the event to send\n     * @param {Object} data data to send with the event, default = empty object\n     */","meta":{"range":[27760,27836],"filename":"Drawable.js","lineno":973,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003941","name":"Drawable#notify","type":"MethodDefinition","paramnames":["id","data"]},"vars":{"":null}},"description":"Sends a notification to listeners","tags":[{"originalTitle":"note:","title":"note:","text":"this is a simple wrapper to the NotificationManageger's notify method","value":"this is a simple wrapper to the NotificationManageger's notify method"}],"params":[{"type":{"names":["String"]},"description":"name of the event to send","name":"id"},{"type":{"names":["Object"]},"description":"data to send with the event, default = empty object","name":"data"}],"name":"notify","longname":"Drawable#notify","kind":"function","memberof":"Drawable","scope":"instance","$longname":"Drawable#notify"},{"comment":"/**\n     * onCollision is called on each collision with the object.\n     *\n     * This method does nothing and should be extended if needed.\n     *\n     */","meta":{"range":[24683,24705],"filename":"Drawable.js","lineno":864,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003687","name":"Drawable#onCollision","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"onCollision is called on each collision with the object.\n\nThis method does nothing and should be extended if needed.","name":"onCollision","longname":"Drawable#onCollision","kind":"function","memberof":"Drawable","scope":"instance","params":[],"$longname":"Drawable#onCollision"},{"comment":"/**\n     * onHit is called when the object collides with another object\n     *\n     * @param {Drawable} obj The object that collided.\n     *\n     * This function does nothing interesting: this should be extended if needed.\n     */","meta":{"range":[21068,21203],"filename":"Drawable.js","lineno":742,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003419","name":"Drawable#onHit","type":"MethodDefinition","paramnames":["obj"]},"vars":{"":null}},"description":"onHit is called when the object collides with another object","params":[{"type":{"names":["Drawable"]},"description":"The object that collided.\n\nThis function does nothing interesting: this should be extended if needed.","name":"obj"}],"name":"onHit","longname":"Drawable#onHit","kind":"function","memberof":"Drawable","scope":"instance","$longname":"Drawable#onHit"},{"comment":"/**\n     * Plays the spcified sound\n     *\n     * @param {String} id The id of the sound to play.\n     * @param {Object} options\n     * @param {Boolean} [options.pan=true] Set pan to true if you want to use panning.\n     * @param {Boolean} [options.loop=false] Set to true to loop the sound.\n     */","meta":{"range":[26781,27467],"filename":"Drawable.js","lineno":943,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003823","name":"Drawable#playSound","type":"MethodDefinition","paramnames":["id","options"]},"vars":{"":null}},"description":"Plays the spcified sound","params":[{"type":{"names":["String"]},"description":"The id of the sound to play.","name":"id"},{"type":{"names":["Object"]},"name":"options"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":true,"description":"Set pan to true if you want to use panning.","name":"options.pan"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"Set to true to loop the sound.","name":"options.loop"}],"name":"playSound","longname":"Drawable#playSound","kind":"function","memberof":"Drawable","scope":"instance","$longname":"Drawable#playSound"},{"comment":"/**\n     * Remove every children from the object.\n     */","meta":{"range":[25612,25780],"filename":"Drawable.js","lineno":903,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003759","name":"Drawable#removeAllChildren","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Remove every children from the object.","name":"removeAllChildren","longname":"Drawable#removeAllChildren","kind":"function","memberof":"Drawable","scope":"instance","params":[],"$longname":"Drawable#removeAllChildren"},{"comment":"/**\n     * Remove a child from the object\n     *\n     * @param {Drawable} child The child to remove from the object.\n     *\n     * @note: removing a child object will call its `destroy` method.\n     */","meta":{"range":[25351,25544],"filename":"Drawable.js","lineno":891,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003720","name":"Drawable#removeChild","type":"MethodDefinition","paramnames":["child"]},"vars":{"":null}},"description":"Remove a child from the object","params":[{"type":{"names":["Drawable"]},"description":"The child to remove from the object.","name":"child"}],"tags":[{"originalTitle":"note:","title":"note:","text":"removing a child object will call its `destroy` method.","value":"removing a child object will call its `destroy` method."}],"name":"removeChild","longname":"Drawable#removeChild","kind":"function","memberof":"Drawable","scope":"instance","$longname":"Drawable#removeChild"},{"comment":"/**\n     * User customized reset method\n     */","meta":{"range":[3584,3600],"filename":"Drawable.js","lineno":119,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001682","name":"Drawable#reset","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"User customized reset method","name":"reset","longname":"Drawable#reset","kind":"function","memberof":"Drawable","scope":"instance","params":[],"$longname":"Drawable#reset"},{"comment":"/**\n     * Restores the previous context globalAlpha property.\n     *\n     * @param {RenderingContext} ctx The context.\n     */","meta":{"range":[15480,15550],"filename":"Drawable.js","lineno":568,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002804","name":"Drawable#restoreCtxAlpha","type":"MethodDefinition","paramnames":["ctx"]},"vars":{"":null}},"description":"Restores the previous context globalAlpha property.","params":[{"type":{"names":["RenderingContext"]},"description":"The context.","name":"ctx"}],"name":"restoreCtxAlpha","longname":"Drawable#restoreCtxAlpha","kind":"function","memberof":"Drawable","scope":"instance","$longname":"Drawable#restoreCtxAlpha"},{"comment":"/**\n     * Saves current object position into `savedX` and `savedY` properties\n     */","meta":{"range":[12966,13048],"filename":"Drawable.js","lineno":445,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002663","name":"Drawable#savePosition","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Saves current object position into `savedX` and `savedY` properties","name":"savePosition","longname":"Drawable#savePosition","kind":"function","memberof":"Drawable","scope":"instance","params":[],"$longname":"Drawable#savePosition"},{"comment":"/**\n     * Change the angle of an object\n     *\n     * @param {number} angle The new angle of the object. 0 < angle < 360.\n     *\n     * @note This property is only used for the rendering and it's ignored for collisions.\n     */","meta":{"range":[14109,14207],"filename":"Drawable.js","lineno":500,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002723","name":"Drawable#setAngle","type":"MethodDefinition","paramnames":["angle"]},"vars":{"":null}},"description":"Change the angle of an object","params":[{"type":{"names":["number"]},"description":"The new angle of the object. 0 < angle < 360.","name":"angle"}],"tags":[{"originalTitle":"note","title":"note","text":"This property is only used for the rendering and it's ignored for collisions.","value":"This property is only used for the rendering and it's ignored for collisions."}],"name":"setAngle","longname":"Drawable#setAngle","kind":"function","memberof":"Drawable","scope":"instance","$longname":"Drawable#setAngle"},{"comment":"/**\n     * Sets a new behavior to the object: this will be called in the move loop\n     *\n     * @param {(String|Behavior)} behavior Either the name of a standard behavior or a Behavior class to use.\n     * @param {Object} [options={}] The options of the behavior (may depend on the behavior type).\n     *\n     * @related {Behavior}\n     */","meta":{"range":[9643,9896],"filename":"Drawable.js","lineno":336,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002322","name":"Drawable#setBehavior","type":"MethodDefinition","paramnames":["behavior","options"]},"vars":{"":null}},"description":"Sets a new behavior to the object: this will be called in the move loop","params":[{"type":{"names":["String","Behavior"]},"description":"Either the name of a standard behavior or a Behavior class to use.","name":"behavior"},{"type":{"names":["Object"]},"optional":true,"defaultvalue":"{}","description":"The options of the behavior (may depend on the behavior type).","name":"options"}],"tags":[{"originalTitle":"related","title":"related","text":"{Behavior}","value":"{Behavior}"}],"name":"setBehavior","longname":"Drawable#setBehavior","kind":"function","memberof":"Drawable","scope":"instance","$longname":"Drawable#setBehavior"},{"comment":"/**\n     * Associates an image to the drawable.\n     *\n     * Some objects (eg. Sprite) need a source sheet image before being able to\n     * be rendered onto the display.\n     *\n     * @param {Image} image the image that this object needs to draw: redefine if needed\n     */","meta":{"range":[26066,26090],"filename":"Drawable.js","lineno":918,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003795","name":"Drawable#setImage","type":"MethodDefinition","paramnames":["image"]},"vars":{"":null}},"description":"Associates an image to the drawable.\n\nSome objects (eg. Sprite) need a source sheet image before being able to\nbe rendered onto the display.","params":[{"type":{"names":["Image"]},"description":"the image that this object needs to draw: redefine if needed","name":"image"}],"name":"setImage","longname":"Drawable#setImage","kind":"function","memberof":"Drawable","scope":"instance","$longname":"Drawable#setImage"},{"comment":"/**\n     * Sets the map of the object.\n     *\n     * @param {Map} map The map of the object.\n     *\n     * @note you don't usually need to call this method as it's called automatically when adding an object\n     * onto a map.\n     *\n     */","meta":{"range":[5146,5283],"filename":"Drawable.js","lineno":176,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001916","name":"Drawable#setMap","type":"MethodDefinition","paramnames":["map"]},"vars":{"":null}},"description":"Sets the map of the object.","params":[{"type":{"names":["Map"]},"description":"The map of the object.","name":"map"}],"tags":[{"originalTitle":"note","title":"note","text":"you don't usually need to call this method as it's called automatically when adding an object\nonto a map.","value":"you don't usually need to call this method as it's called automatically when adding an object\nonto a map."}],"name":"setMap","longname":"Drawable#setMap","kind":"function","memberof":"Drawable","scope":"instance","$longname":"Drawable#setMap"},{"comment":"/**\n     * Applies a new mask to the object, clipping its drawing onto the scene/map\n     *\n     * @param {Object} mask The new mask to use, set to null to remove the mask.\n     * @param {Boolean} exclude Set to true to have the mask exclude portions of the drawing, in this case mask.color will be used.\n     */","meta":{"range":[8066,8211],"filename":"Drawable.js","lineno":275,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002197","name":"Drawable#setMask","type":"MethodDefinition","paramnames":["mask","exclude"]},"vars":{"":null}},"description":"Applies a new mask to the object, clipping its drawing onto the scene/map","params":[{"type":{"names":["Object"]},"description":"The new mask to use, set to null to remove the mask.","name":"mask","defaultvalue":null},{"type":{"names":["Boolean"]},"description":"Set to true to have the mask exclude portions of the drawing, in this case mask.color will be used.","name":"exclude","defaultvalue":false}],"name":"setMask","longname":"Drawable#setMask","kind":"function","memberof":"Drawable","scope":"instance","$longname":"Drawable#setMask"},{"comment":"/**\n     * Changes the opacity of the object\n     *\n     * @param {number} opacity The new opacity.\n     */","meta":{"range":[8329,8388],"filename":"Drawable.js","lineno":287,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002224","name":"Drawable#setOpacity","type":"MethodDefinition","paramnames":["opacity"]},"vars":{"":null}},"description":"Changes the opacity of the object","params":[{"type":{"names":["number"]},"description":"The new opacity.","name":"opacity"}],"name":"setOpacity","longname":"Drawable#setOpacity","kind":"function","memberof":"Drawable","scope":"instance","$longname":"Drawable#setOpacity"},{"comment":"/**\n     * Sets a new path for the object\n     *\n     * @param {Path} path The new path that the object will use when moving.\n     *\n     * @related {Path}\n     */","meta":{"range":[13547,13594],"filename":"Drawable.js","lineno":478,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002701","name":"Drawable#setPath","type":"MethodDefinition","paramnames":["path"]},"vars":{"":null}},"description":"Sets a new path for the object","params":[{"type":{"names":["Path"]},"description":"The new path that the object will use when moving.","name":"path"}],"tags":[{"originalTitle":"related","title":"related","text":"{Path}","value":"{Path}"}],"name":"setPath","longname":"Drawable#setPath","kind":"function","memberof":"Drawable","scope":"instance","$longname":"Drawable#setPath"},{"comment":"/**\n     * WIP Sets the platform of the object. This will be used when platforms will be fully implemented.\n     *\n     * @param {Drawable} platform The platform the object is attached to.\n     */","meta":{"range":[5872,5935],"filename":"Drawable.js","lineno":204,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001970","name":"Drawable#setPlatform","type":"MethodDefinition","paramnames":["platform"]},"vars":{"":null}},"description":"WIP Sets the platform of the object. This will be used when platforms will be fully implemented.","params":[{"type":{"names":["Drawable"]},"description":"The platform the object is attached to.","name":"platform"}],"name":"setPlatform","longname":"Drawable#setPlatform","kind":"function","memberof":"Drawable","scope":"instance","$longname":"Drawable#setPlatform"},{"comment":"/**\n     * Change the scale of the object\n     *\n     * @param {number} scale The new scale of the object.\n     *\n     * @note: it's only used when rendering, collision detection is not using the scale yet.\n     */","meta":{"range":[13819,13870],"filename":"Drawable.js","lineno":489,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002712","name":"Drawable#setScale","type":"MethodDefinition","paramnames":["scale"]},"vars":{"":null}},"description":"Change the scale of the object","params":[{"type":{"names":["number"]},"description":"The new scale of the object.","name":"scale"}],"tags":[{"originalTitle":"note:","title":"note:","text":"it's only used when rendering, collision detection is not using the scale yet.","value":"it's only used when rendering, collision detection is not using the scale yet."}],"name":"setScale","longname":"Drawable#setScale","kind":"function","memberof":"Drawable","scope":"instance","$longname":"Drawable#setScale"},{"comment":"/**\n     * Sets the scene of the object.\n     *\n     * @param {Scene} scene The scene of the object.\n     *\n     * @note you don't usually need to call this method as it's called when adding an object onto a scene.\n     */","meta":{"range":[5516,5665],"filename":"Drawable.js","lineno":191,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001943","name":"Drawable#setScene","type":"MethodDefinition","paramnames":["scene"]},"vars":{"":null}},"description":"Sets the scene of the object.","params":[{"type":{"names":["Scene"]},"description":"The scene of the object.","name":"scene"}],"tags":[{"originalTitle":"note","title":"note","text":"you don't usually need to call this method as it's called when adding an object onto a scene.","value":"you don't usually need to call this method as it's called when adding an object onto a scene."}],"name":"setScene","longname":"Drawable#setScene","kind":"function","memberof":"Drawable","scope":"instance","$longname":"Drawable#setScene"},{"comment":"/**\n     * Show the object\n     *\n     * @returns {Drawable} this\n     */","meta":{"range":[14860,14925],"filename":"Drawable.js","lineno":543,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002771","name":"Drawable#show","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Show the object","returns":[{"type":{"names":["Drawable"]},"description":"this"}],"name":"show","longname":"Drawable#show","kind":"function","memberof":"Drawable","scope":"instance","params":[],"$longname":"Drawable#show"},{"comment":"/**\n     * Draws the sprite hit box\n     *\n     * @param {RenderingContext} The canvas context where to render the hitbox.\n     */","meta":{"range":[16663,18176],"filename":"Drawable.js","lineno":617,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002857","name":"Drawable#showHitBox","type":"MethodDefinition","paramnames":["ctx"]},"vars":{"":null}},"description":"Draws the sprite hit box","params":[{"type":{"names":["RenderingContext"]},"description":"canvas context where to render the hitbox.","name":"The"}],"name":"showHitBox","longname":"Drawable#showHitBox","kind":"function","memberof":"Drawable","scope":"instance","$longname":"Drawable#showHitBox"},{"comment":"/**\n       * Draws a box around objects. This method is called when debugging is enabled.\n       *\n       * @param {RenderingContext} ctx The context where to draw the box.\n       */","meta":{"range":[18369,18743],"filename":"Drawable.js","lineno":656,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003054","name":"Drawable#showObjectBox","type":"MethodDefinition","paramnames":["ctx"]},"vars":{"":null}},"description":"Draws a box around objects. This method is called when debugging is enabled.","params":[{"type":{"names":["RenderingContext"]},"description":"The context where to draw the box.","name":"ctx"}],"name":"showObjectBox","longname":"Drawable#showObjectBox","kind":"function","memberof":"Drawable","scope":"instance","$longname":"Drawable#showObjectBox"},{"comment":"/**\n     * Moves the object by snapping it to the map tiles\n     *\n     * @param {Boolean} isLeft Should we snap to the left?\n     * @param {Boolean} isUp Should we snap to the right?\n     */","meta":{"range":[7193,7743],"filename":"Drawable.js","lineno":248,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002106","name":"Drawable#snapToMap","type":"MethodDefinition","paramnames":["isLeft","isUp"]},"vars":{"":null}},"description":"Moves the object by snapping it to the map tiles","params":[{"type":{"names":["Boolean"]},"description":"Should we snap to the left?","name":"isLeft"},{"type":{"names":["Boolean"]},"description":"Should we snap to the right?","name":"isUp"}],"name":"snapToMap","longname":"Drawable#snapToMap","kind":"function","memberof":"Drawable","scope":"instance","$longname":"Drawable#snapToMap"},{"comment":"/**\n     * Stops current running animation\n     *\n     * In some cases, the game may need to stop effects from running before\n     * they are completed. This method proves a way to do so and set an end value.\n     *\n     * @param {any} setEndValue The end value of the animation.\n     */","meta":{"range":[23545,23877],"filename":"Drawable.js","lineno":821,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003608","name":"Drawable#stopAnimate","type":"MethodDefinition","paramnames":["setEndValue"]},"vars":{"":null}},"description":"Stops current running animation\n\nIn some cases, the game may need to stop effects from running before\nthey are completed. This method proves a way to do so and set an end value.","params":[{"type":{"names":["any"]},"description":"The end value of the animation.","name":"setEndValue"}],"name":"stopAnimate","longname":"Drawable#stopAnimate","kind":"function","memberof":"Drawable","scope":"instance","$longname":"Drawable#stopAnimate"}],"$constructor":{"comment":"/**\n     * Creates a new Drawable: this class should be extended before creating an instance\n     *\n     * @param {String} type The type of object: this describes the type of object\n     * @param {Object} options\n     * @param {String} [options.objectId] The id of the object. The defaults is type + random timestamp.\n     * @param {Number} [options.collideGroup=0] The type of collision to use for the object.\n     * @param {Boolean} [options.master=false] Set to true if the object should be the master.\n     * @param {Boolean} [options.visible=true] An invisible object isn't rendered onto the screen.\n     */","meta":{"range":[1216,3526],"filename":"Drawable.js","lineno":28,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001393","name":"Drawable","type":"MethodDefinition","paramnames":["type","options"]},"vars":{"":null}},"description":"Creates a new Drawable: this class should be extended before creating an instance","params":[{"type":{"names":["String"]},"description":"The type of object: this describes the type of object","name":"type"},{"type":{"names":["Object"]},"name":"options"},{"type":{"names":["String"]},"optional":true,"description":"The id of the object. The defaults is type + random timestamp.","name":"options.objectId"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"The type of collision to use for the object.","name":"options.collideGroup"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"Set to true if the object should be the master.","name":"options.master"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":true,"description":"An invisible object isn't rendered onto the screen.","name":"options.visible"}],"name":"Drawable","longname":"Drawable","kind":"class","scope":"global","undocumented":true,"$longname":"Drawable"}},{"comment":"/**\n * The menu class allows to quickly add text menu to an Athena Scene\n *\n * Each menu entry is called menuItem and is a simple object with the following properties:\n * `{ text: 'menu text', selectable: true|false, active: true|false, visible: true|false }`\n *\n * @extends Drawable\n */","meta":{"range":[363,4937],"filename":"Menu.js","lineno":12,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100004172","name":"Menu","type":"ClassDeclaration","paramnames":["type","options"]}},"classdesc":"The menu class allows to quickly add text menu to an Athena Scene\n\nEach menu entry is called menuItem and is a simple object with the following properties:\n`{ text: 'menu text', selectable: true|false, active: true|false, visible: true|false }`","augments":["Drawable"],"name":"Menu","longname":"Menu","kind":"class","scope":"global","description":"Creates a new Menu","params":[{"type":{"names":["String"]},"description":"The type of object.","name":"type"},{"type":{"names":["Object"]},"name":"options"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"Menu Title\"","description":"The title of the menu.","name":"options.title"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"black\"","description":"The color of the menu.","name":"options.color"},{"type":{"names":["Array"]},"optional":true,"defaultvalue":"[]","description":"The menu items to add.","name":"options.menuItems"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"red\"","description":"The default color to use for the selected menu item.","name":"options.selectedColor"}],"$longname":"Menu","$members":[{"comment":"/**\n     * Add a new Child to the object.\n     *\n     * Childs are automatically rendered and moved when the parent object is.\n     *\n     * @param {Drawable} child The child to add.\n     *\n     * @note children are automatically added to the scene/map of the parent object.\n     */","meta":{"range":[24998,25139],"filename":"Drawable.js","lineno":877,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003691","name":"Drawable#addChild","type":"MethodDefinition","paramnames":["child"]},"vars":{"":null}},"description":"Add a new Child to the object.\n\nChilds are automatically rendered and moved when the parent object is.","params":[{"type":{"names":["Drawable"]},"description":"The child to add.","name":"child"}],"tags":[{"originalTitle":"note","title":"note","text":"children are automatically added to the scene/map of the parent object.","value":"children are automatically added to the scene/map of the parent object."}],"name":"addChild","longname":"Menu#addChild","kind":"function","memberof":"Menu","scope":"instance","inherits":"Drawable#addChild","inherited":true,"$longname":"Menu#addChild"},{"comment":"/**\n     * Adds a new menu item\n     *\n     * @param {Object} menu An hash describing the menu.\n     *\n     * The hash can have the following properties:\n     * { text: 'menu text', selectable: true|false, active: true|false, visible: true|false }\n     */","meta":{"range":[2338,2719],"filename":"Menu.js","lineno":80,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100004289","name":"Menu#addMenuItem","type":"MethodDefinition","paramnames":["menu"]},"vars":{"":null}},"description":"Adds a new menu item","params":[{"type":{"names":["Object"]},"description":"An hash describing the menu.\n\nThe hash can have the following properties:\n{ text: 'menu text', selectable: true|false, active: true|false, visible: true|false }","name":"menu"}],"name":"addMenuItem","longname":"Menu#addMenuItem","kind":"function","memberof":"Menu","scope":"instance","$longname":"Menu#addMenuItem"},{"comment":"/**\n     * Adds several menuItems in a row\n     *\n     * @param {Array<Object>} items The list of items to add\n     *\n     * @see {@link #Menu#addMenuItem|`Menu.addMenuItem()`}\n     */","meta":{"range":[2914,3168],"filename":"Menu.js","lineno":98,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100004365","name":"Menu#addMenuItems","type":"MethodDefinition","paramnames":["items"]},"vars":{"":null}},"description":"Adds several menuItems in a row","params":[{"type":{"names":["Array.<Object>"]},"description":"The list of items to add","name":"items"}],"see":["{@link #Menu#addMenuItem|`Menu.addMenuItem()`}"],"name":"addMenuItems","longname":"Menu#addMenuItems","kind":"function","memberof":"Menu","scope":"instance","$longname":"Menu#addMenuItems"},{"comment":"/**\n     * Add a new handler to be called after each move of the object\n     *\n     * @param {Function} cb The callback to add.\n     */","meta":{"range":[20765,20827],"filename":"Drawable.js","lineno":731,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003406","name":"Drawable#addMoveHandler","type":"MethodDefinition","paramnames":["cb"]},"vars":{"":null}},"description":"Add a new handler to be called after each move of the object","params":[{"type":{"names":["function"]},"description":"The callback to add.","name":"cb"}],"name":"addMoveHandler","longname":"Menu#addMoveHandler","kind":"function","memberof":"Menu","scope":"instance","inherits":"Drawable#addMoveHandler","inherited":true,"$longname":"Menu#addMoveHandler"},{"comment":"/**\n     * Performs an animation on the object using one of the defined {FX} effects\n     *\n     * Effects change the object size/position using an interpolation function.\n     *\n     * Athena has the following effects:\n     * - {Fade} performs a fade\n     * - {Mosaic} performs a SNES-like mosaic effect\n     * - {Rotate} performs a rotation on the object\n     *\n     * @param {String} fxName The name of the effect to use.\n     * @param {Object} options The options of the effect.\n     * @param {String} [options.easing=\"linear\"] The easing functions to use, can be: 'linear', 'swing', 'easeInQuad', 'easeOutBounce'.\n     *\n     * @returns {Promise} a promise that will be fullfilled when the effect has been completed\n     */","meta":{"range":[22444,23247],"filename":"Drawable.js","lineno":787,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003490","name":"Drawable#animate","type":"MethodDefinition","paramnames":["fxName","options"]},"vars":{"":null}},"description":"Performs an animation on the object using one of the defined {FX} effects\n\nEffects change the object size/position using an interpolation function.\n\nAthena has the following effects:\n- {Fade} performs a fade\n- {Mosaic} performs a SNES-like mosaic effect\n- {Rotate} performs a rotation on the object","params":[{"type":{"names":["String"]},"description":"The name of the effect to use.","name":"fxName"},{"type":{"names":["Object"]},"description":"The options of the effect.","name":"options"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"linear\"","description":"The easing functions to use, can be: 'linear', 'swing', 'easeInQuad', 'easeOutBounce'.","name":"options.easing"}],"returns":[{"type":{"names":["Promise"]},"description":"a promise that will be fullfilled when the effect has been completed"}],"name":"animate","longname":"Menu#animate","kind":"function","memberof":"Menu","scope":"instance","inherits":"Drawable#animate","inherited":true,"$longname":"Menu#animate"},{"comment":"/**\n     * Stops the object from moving, optionnaly immediately going to target position\n     *\n     * @param {Boolean} [gotoTarget=false] Set to true to go to the target position.\n     */","meta":{"range":[8766,8998],"filename":"Drawable.js","lineno":305,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002243","name":"Drawable#cancelMoveTo","type":"MethodDefinition","paramnames":["gotoTarget"]},"vars":{"":null}},"description":"Stops the object from moving, optionnaly immediately going to target position","params":[{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"Set to true to go to the target position.","name":"gotoTarget"}],"name":"cancelMoveTo","longname":"Menu#cancelMoveTo","kind":"function","memberof":"Menu","scope":"instance","inherits":"Drawable#cancelMoveTo","inherited":true,"$longname":"Menu#cancelMoveTo"},{"comment":"/**\n     * Centers the object into the scene.\n     *\n     * @returns {Drawable} this\n     */","meta":{"range":[9101,9292],"filename":"Drawable.js","lineno":320,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002280","name":"Drawable#center","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Centers the object into the scene.","returns":[{"type":{"names":["Drawable"]},"description":"this"}],"name":"center","longname":"Menu#center","kind":"function","memberof":"Menu","scope":"instance","params":[],"inherits":"Drawable#center","inherited":true,"$longname":"Menu#center"},{"comment":"/**\n     * Stop using a particular behavior.\n     *\n     * The vx and vy properties of the object will be set to zero.\n     */","meta":{"range":[10033,10117],"filename":"Drawable.js","lineno":349,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002359","name":"Drawable#clearBehavior","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Stop using a particular behavior.\n\nThe vx and vy properties of the object will be set to zero.","name":"clearBehavior","longname":"Menu#clearBehavior","kind":"function","memberof":"Menu","scope":"instance","params":[],"inherits":"Drawable#clearBehavior","inherited":true,"$longname":"Menu#clearBehavior"},{"comment":"/**\n     * Destroy is called when an object is removed from a scene or object\n     *\n     * @note calling destroy on a parent will automatically call the destroy method of each child.\n     */","meta":{"range":[28118,28636],"filename":"Drawable.js","lineno":984,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003963","name":"Drawable#destroy","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Destroy is called when an object is removed from a scene or object","tags":[{"originalTitle":"note","title":"note","text":"calling destroy on a parent will automatically call the destroy method of each child.","value":"calling destroy on a parent will automatically call the destroy method of each child."}],"name":"destroy","longname":"Menu#destroy","kind":"function","memberof":"Menu","scope":"instance","params":[],"inherits":"Drawable#destroy","inherited":true,"$longname":"Menu#destroy"},{"comment":"/**\n     * Returns the angle property of the object.\n     * \n     * @returns {Number} The angle of the object\n     */","meta":{"range":[14335,14380],"filename":"Drawable.js","lineno":510,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002734","name":"Drawable#getAngle","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the angle property of the object.","returns":[{"type":{"names":["Number"]},"description":"The angle of the object"}],"name":"getAngle","longname":"Menu#getAngle","kind":"function","memberof":"Menu","scope":"instance","params":[],"inherits":"Drawable#getAngle","inherited":true,"$longname":"Menu#getAngle"},{"comment":"/**\n     * Returns the current height of the object: with some types of Drawables ({Sprite}),\n     * height can vary\n     *\n     * @returns {number} The current height of the object\n     *\n     * @related {Sprite}\n     */","meta":{"range":[16065,16119],"filename":"Drawable.js","lineno":592,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002825","name":"Drawable#getCurrentHeight","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the current height of the object: with some types of Drawables ({Sprite}),\nheight can vary","returns":[{"type":{"names":["number"]},"description":"The current height of the object"}],"tags":[{"originalTitle":"related","title":"related","text":"{Sprite}","value":"{Sprite}"}],"name":"getCurrentHeight","longname":"Menu#getCurrentHeight","kind":"function","memberof":"Menu","scope":"instance","params":[],"inherits":"Drawable#getCurrentHeight","inherited":true,"$longname":"Menu#getCurrentHeight"},{"comment":"/**\n     * Returns the current width of the drawable: with some types of drawables ({Sprite}),\n     * width can vary\n     *\n     * @returns {number} The current width of the object\n     *\n     * @related {Sprite}\n     */","meta":{"range":[15781,15833],"filename":"Drawable.js","lineno":580,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002817","name":"Drawable#getCurrentWidth","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the current width of the drawable: with some types of drawables ({Sprite}),\nwidth can vary","returns":[{"type":{"names":["number"]},"description":"The current width of the object"}],"tags":[{"originalTitle":"related","title":"related","text":"{Sprite}","value":"{Sprite}"}],"name":"getCurrentWidth","longname":"Menu#getCurrentWidth","kind":"function","memberof":"Menu","scope":"instance","params":[],"inherits":"Drawable#getCurrentWidth","inherited":true,"$longname":"Menu#getCurrentWidth"},{"comment":"/**\n     * Returns the object's hitbox.\n     *\n     * Some drawables (eg. {Sprite} may have different hitbox for different frames.\n     *\n     * @returns {Object} an object with x, y, x2, Y2 describing the hit box\n     */","meta":{"range":[16351,16522],"filename":"Drawable.js","lineno":603,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002833","name":"Drawable#getHitBox","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the object's hitbox.\n\nSome drawables (eg. {Sprite} may have different hitbox for different frames.","returns":[{"type":{"names":["Object"]},"description":"an object with x, y, x2, Y2 describing the hit box"}],"name":"getHitBox","longname":"Menu#getHitBox","kind":"function","memberof":"Menu","scope":"instance","params":[],"inherits":"Drawable#getHitBox","inherited":true,"$longname":"Menu#getHitBox"},{"comment":"/**\n     * Returns the current opacity of the object\n     *\n     * @returns {number} The current opacity value.\n     */","meta":{"range":[8518,8567],"filename":"Drawable.js","lineno":296,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002235","name":"Drawable#getOpacity","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the current opacity of the object","returns":[{"type":{"names":["number"]},"description":"The current opacity value."}],"name":"getOpacity","longname":"Menu#getOpacity","kind":"function","memberof":"Menu","scope":"instance","params":[],"inherits":"Drawable#getOpacity","inherited":true,"$longname":"Menu#getOpacity"},{"comment":"/**\n     * Returns previously seved position\n     *\n     * @returns {Object} The saved position\n     */","meta":{"range":[13162,13271],"filename":"Drawable.js","lineno":455,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002683","name":"Drawable#getSavedPosition","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns previously seved position","returns":[{"type":{"names":["Object"]},"description":"The saved position"}],"name":"getSavedPosition","longname":"Menu#getSavedPosition","kind":"function","memberof":"Menu","scope":"instance","params":[],"inherits":"Drawable#getSavedPosition","inherited":true,"$longname":"Menu#getSavedPosition"},{"comment":"/**\n     * Hides the object\n     *\n     * @returns {Drawable} this\n     */","meta":{"range":[14710,14776],"filename":"Drawable.js","lineno":532,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002759","name":"Drawable#hide","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Hides the object","returns":[{"type":{"names":["Drawable"]},"description":"this"}],"name":"hide","longname":"Menu#hide","kind":"function","memberof":"Menu","scope":"instance","params":[],"inherits":"Drawable#hide","inherited":true,"$longname":"Menu#hide"},{"comment":"/**\n     * Performs collision tests on the specifed object.\n     *\n     * @param {Drawable} obj The object to perform test on\n     *\n     * @returns {Boolean} Returns true if this and obj collide\n     */","meta":{"range":[19080,20353],"filename":"Drawable.js","lineno":678,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003151","name":"Drawable#hitTest","type":"MethodDefinition","paramnames":["obj"]},"vars":{"":null}},"description":"Performs collision tests on the specifed object.","params":[{"type":{"names":["Drawable"]},"description":"The object to perform test on","name":"obj"}],"returns":[{"type":{"names":["Boolean"]},"description":"Returns true if this and obj collide"}],"name":"hitTest","longname":"Menu#hitTest","kind":"function","memberof":"Menu","scope":"instance","inherits":"Drawable#hitTest","inherited":true,"$longname":"Menu#hitTest"},{"comment":"/**\n     * Moves the object to a new destination.\n     *\n     * @param {number} x The new horizontal position.\n     * @param {number} y The new vertical position.\n     * @param {number} [duration=0] The duration of the move, 0 to have the object move immediately to new position.\n     *\n     * @returns {Drawable} this\n     */","meta":{"range":[6272,6991],"filename":"Drawable.js","lineno":217,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001981","name":"Drawable#moveTo","type":"MethodDefinition","paramnames":["x","y","duration"]},"vars":{"":null}},"description":"Moves the object to a new destination.","params":[{"type":{"names":["number"]},"description":"The new horizontal position.","name":"x"},{"type":{"names":["number"]},"description":"The new vertical position.","name":"y"},{"type":{"names":["number"]},"optional":true,"defaultvalue":0,"description":"The duration of the move, 0 to have the object move immediately to new position.","name":"duration"}],"returns":[{"type":{"names":["Drawable"]},"description":"this"}],"name":"moveTo","longname":"Menu#moveTo","kind":"function","memberof":"Menu","scope":"instance","inherits":"Drawable#moveTo","inherited":true,"$longname":"Menu#moveTo"},{"comment":"/**\n     * Sends a notification to listeners\n     *\n     * @note: this is a simple wrapper to the NotificationManageger's notify method\n     *\n     * @param {String} id name of the event to send\n     * @param {Object} data data to send with the event, default = empty object\n     */","meta":{"range":[27760,27836],"filename":"Drawable.js","lineno":973,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003941","name":"Drawable#notify","type":"MethodDefinition","paramnames":["id","data"]},"vars":{"":null}},"description":"Sends a notification to listeners","tags":[{"originalTitle":"note:","title":"note:","text":"this is a simple wrapper to the NotificationManageger's notify method","value":"this is a simple wrapper to the NotificationManageger's notify method"}],"params":[{"type":{"names":["String"]},"description":"name of the event to send","name":"id"},{"type":{"names":["Object"]},"description":"data to send with the event, default = empty object","name":"data"}],"name":"notify","longname":"Menu#notify","kind":"function","memberof":"Menu","scope":"instance","inherits":"Drawable#notify","inherited":true,"$longname":"Menu#notify"},{"comment":"/**\n     * onCollision is called on each collision with the object.\n     *\n     * This method does nothing and should be extended if needed.\n     *\n     */","meta":{"range":[24683,24705],"filename":"Drawable.js","lineno":864,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003687","name":"Drawable#onCollision","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"onCollision is called on each collision with the object.\n\nThis method does nothing and should be extended if needed.","name":"onCollision","longname":"Menu#onCollision","kind":"function","memberof":"Menu","scope":"instance","params":[],"inherits":"Drawable#onCollision","inherited":true,"$longname":"Menu#onCollision"},{"comment":"/**\n     * onHit is called when the object collides with another object\n     *\n     * @param {Drawable} obj The object that collided.\n     *\n     * This function does nothing interesting: this should be extended if needed.\n     */","meta":{"range":[21068,21203],"filename":"Drawable.js","lineno":742,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003419","name":"Drawable#onHit","type":"MethodDefinition","paramnames":["obj"]},"vars":{"":null}},"description":"onHit is called when the object collides with another object","params":[{"type":{"names":["Drawable"]},"description":"The object that collided.\n\nThis function does nothing interesting: this should be extended if needed.","name":"obj"}],"name":"onHit","longname":"Menu#onHit","kind":"function","memberof":"Menu","scope":"instance","inherits":"Drawable#onHit","inherited":true,"$longname":"Menu#onHit"},{"comment":"/**\n     * Plays the spcified sound\n     *\n     * @param {String} id The id of the sound to play.\n     * @param {Object} options\n     * @param {Boolean} [options.pan=true] Set pan to true if you want to use panning.\n     * @param {Boolean} [options.loop=false] Set to true to loop the sound.\n     */","meta":{"range":[26781,27467],"filename":"Drawable.js","lineno":943,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003823","name":"Drawable#playSound","type":"MethodDefinition","paramnames":["id","options"]},"vars":{"":null}},"description":"Plays the spcified sound","params":[{"type":{"names":["String"]},"description":"The id of the sound to play.","name":"id"},{"type":{"names":["Object"]},"name":"options"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":true,"description":"Set pan to true if you want to use panning.","name":"options.pan"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"Set to true to loop the sound.","name":"options.loop"}],"name":"playSound","longname":"Menu#playSound","kind":"function","memberof":"Menu","scope":"instance","inherits":"Drawable#playSound","inherited":true,"$longname":"Menu#playSound"},{"comment":"/**\n     * Remove every children from the object.\n     */","meta":{"range":[25612,25780],"filename":"Drawable.js","lineno":903,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003759","name":"Drawable#removeAllChildren","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Remove every children from the object.","name":"removeAllChildren","longname":"Menu#removeAllChildren","kind":"function","memberof":"Menu","scope":"instance","params":[],"inherits":"Drawable#removeAllChildren","inherited":true,"$longname":"Menu#removeAllChildren"},{"comment":"/**\n     * Remove a child from the object\n     *\n     * @param {Drawable} child The child to remove from the object.\n     *\n     * @note: removing a child object will call its `destroy` method.\n     */","meta":{"range":[25351,25544],"filename":"Drawable.js","lineno":891,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003720","name":"Drawable#removeChild","type":"MethodDefinition","paramnames":["child"]},"vars":{"":null}},"description":"Remove a child from the object","params":[{"type":{"names":["Drawable"]},"description":"The child to remove from the object.","name":"child"}],"tags":[{"originalTitle":"note:","title":"note:","text":"removing a child object will call its `destroy` method.","value":"removing a child object will call its `destroy` method."}],"name":"removeChild","longname":"Menu#removeChild","kind":"function","memberof":"Menu","scope":"instance","inherits":"Drawable#removeChild","inherited":true,"$longname":"Menu#removeChild"},{"comment":"/**\n     * User customized reset method\n     */","meta":{"range":[3584,3600],"filename":"Drawable.js","lineno":119,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001682","name":"Drawable#reset","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"User customized reset method","name":"reset","longname":"Menu#reset","kind":"function","memberof":"Menu","scope":"instance","params":[],"inherits":"Drawable#reset","inherited":true,"$longname":"Menu#reset"},{"comment":"/**\n     * Restores the previous context globalAlpha property.\n     *\n     * @param {RenderingContext} ctx The context.\n     */","meta":{"range":[15480,15550],"filename":"Drawable.js","lineno":568,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002804","name":"Drawable#restoreCtxAlpha","type":"MethodDefinition","paramnames":["ctx"]},"vars":{"":null}},"description":"Restores the previous context globalAlpha property.","params":[{"type":{"names":["RenderingContext"]},"description":"The context.","name":"ctx"}],"name":"restoreCtxAlpha","longname":"Menu#restoreCtxAlpha","kind":"function","memberof":"Menu","scope":"instance","inherits":"Drawable#restoreCtxAlpha","inherited":true,"$longname":"Menu#restoreCtxAlpha"},{"comment":"/**\n     * Saves current object position into `savedX` and `savedY` properties\n     */","meta":{"range":[12966,13048],"filename":"Drawable.js","lineno":445,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002663","name":"Drawable#savePosition","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Saves current object position into `savedX` and `savedY` properties","name":"savePosition","longname":"Menu#savePosition","kind":"function","memberof":"Menu","scope":"instance","params":[],"inherits":"Drawable#savePosition","inherited":true,"$longname":"Menu#savePosition"},{"comment":"/**\n     * Change the angle of an object\n     *\n     * @param {number} angle The new angle of the object. 0 < angle < 360.\n     *\n     * @note This property is only used for the rendering and it's ignored for collisions.\n     */","meta":{"range":[14109,14207],"filename":"Drawable.js","lineno":500,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002723","name":"Drawable#setAngle","type":"MethodDefinition","paramnames":["angle"]},"vars":{"":null}},"description":"Change the angle of an object","params":[{"type":{"names":["number"]},"description":"The new angle of the object. 0 < angle < 360.","name":"angle"}],"tags":[{"originalTitle":"note","title":"note","text":"This property is only used for the rendering and it's ignored for collisions.","value":"This property is only used for the rendering and it's ignored for collisions."}],"name":"setAngle","longname":"Menu#setAngle","kind":"function","memberof":"Menu","scope":"instance","inherits":"Drawable#setAngle","inherited":true,"$longname":"Menu#setAngle"},{"comment":"/**\n     * Sets a new behavior to the object: this will be called in the move loop\n     *\n     * @param {(String|Behavior)} behavior Either the name of a standard behavior or a Behavior class to use.\n     * @param {Object} [options={}] The options of the behavior (may depend on the behavior type).\n     *\n     * @related {Behavior}\n     */","meta":{"range":[9643,9896],"filename":"Drawable.js","lineno":336,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002322","name":"Drawable#setBehavior","type":"MethodDefinition","paramnames":["behavior","options"]},"vars":{"":null}},"description":"Sets a new behavior to the object: this will be called in the move loop","params":[{"type":{"names":["String","Behavior"]},"description":"Either the name of a standard behavior or a Behavior class to use.","name":"behavior"},{"type":{"names":["Object"]},"optional":true,"defaultvalue":"{}","description":"The options of the behavior (may depend on the behavior type).","name":"options"}],"tags":[{"originalTitle":"related","title":"related","text":"{Behavior}","value":"{Behavior}"}],"name":"setBehavior","longname":"Menu#setBehavior","kind":"function","memberof":"Menu","scope":"instance","inherits":"Drawable#setBehavior","inherited":true,"$longname":"Menu#setBehavior"},{"comment":"/**\n     * Associates an image to the drawable.\n     *\n     * Some objects (eg. Sprite) need a source sheet image before being able to\n     * be rendered onto the display.\n     *\n     * @param {Image} image the image that this object needs to draw: redefine if needed\n     */","meta":{"range":[26066,26090],"filename":"Drawable.js","lineno":918,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003795","name":"Drawable#setImage","type":"MethodDefinition","paramnames":["image"]},"vars":{"":null}},"description":"Associates an image to the drawable.\n\nSome objects (eg. Sprite) need a source sheet image before being able to\nbe rendered onto the display.","params":[{"type":{"names":["Image"]},"description":"the image that this object needs to draw: redefine if needed","name":"image"}],"name":"setImage","longname":"Menu#setImage","kind":"function","memberof":"Menu","scope":"instance","inherits":"Drawable#setImage","inherited":true,"$longname":"Menu#setImage"},{"comment":"/**\n     * Sets the map of the object.\n     *\n     * @param {Map} map The map of the object.\n     *\n     * @note you don't usually need to call this method as it's called automatically when adding an object\n     * onto a map.\n     *\n     */","meta":{"range":[5146,5283],"filename":"Drawable.js","lineno":176,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001916","name":"Drawable#setMap","type":"MethodDefinition","paramnames":["map"]},"vars":{"":null}},"description":"Sets the map of the object.","params":[{"type":{"names":["Map"]},"description":"The map of the object.","name":"map"}],"tags":[{"originalTitle":"note","title":"note","text":"you don't usually need to call this method as it's called automatically when adding an object\nonto a map.","value":"you don't usually need to call this method as it's called automatically when adding an object\nonto a map."}],"name":"setMap","longname":"Menu#setMap","kind":"function","memberof":"Menu","scope":"instance","inherits":"Drawable#setMap","inherited":true,"$longname":"Menu#setMap"},{"comment":"/**\n     * Applies a new mask to the object, clipping its drawing onto the scene/map\n     *\n     * @param {Object} mask The new mask to use, set to null to remove the mask.\n     * @param {Boolean} exclude Set to true to have the mask exclude portions of the drawing, in this case mask.color will be used.\n     */","meta":{"range":[8066,8211],"filename":"Drawable.js","lineno":275,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002197","name":"Drawable#setMask","type":"MethodDefinition","paramnames":["mask","exclude"]},"vars":{"":null}},"description":"Applies a new mask to the object, clipping its drawing onto the scene/map","params":[{"type":{"names":["Object"]},"description":"The new mask to use, set to null to remove the mask.","name":"mask","defaultvalue":null},{"type":{"names":["Boolean"]},"description":"Set to true to have the mask exclude portions of the drawing, in this case mask.color will be used.","name":"exclude","defaultvalue":false}],"name":"setMask","longname":"Menu#setMask","kind":"function","memberof":"Menu","scope":"instance","inherits":"Drawable#setMask","inherited":true,"$longname":"Menu#setMask"},{"comment":"/**\n     * Changes the opacity of the object\n     *\n     * @param {number} opacity The new opacity.\n     */","meta":{"range":[8329,8388],"filename":"Drawable.js","lineno":287,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002224","name":"Drawable#setOpacity","type":"MethodDefinition","paramnames":["opacity"]},"vars":{"":null}},"description":"Changes the opacity of the object","params":[{"type":{"names":["number"]},"description":"The new opacity.","name":"opacity"}],"name":"setOpacity","longname":"Menu#setOpacity","kind":"function","memberof":"Menu","scope":"instance","inherits":"Drawable#setOpacity","inherited":true,"$longname":"Menu#setOpacity"},{"comment":"/**\n     * Sets a new path for the object\n     *\n     * @param {Path} path The new path that the object will use when moving.\n     *\n     * @related {Path}\n     */","meta":{"range":[13547,13594],"filename":"Drawable.js","lineno":478,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002701","name":"Drawable#setPath","type":"MethodDefinition","paramnames":["path"]},"vars":{"":null}},"description":"Sets a new path for the object","params":[{"type":{"names":["Path"]},"description":"The new path that the object will use when moving.","name":"path"}],"tags":[{"originalTitle":"related","title":"related","text":"{Path}","value":"{Path}"}],"name":"setPath","longname":"Menu#setPath","kind":"function","memberof":"Menu","scope":"instance","inherits":"Drawable#setPath","inherited":true,"$longname":"Menu#setPath"},{"comment":"/**\n     * WIP Sets the platform of the object. This will be used when platforms will be fully implemented.\n     *\n     * @param {Drawable} platform The platform the object is attached to.\n     */","meta":{"range":[5872,5935],"filename":"Drawable.js","lineno":204,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001970","name":"Drawable#setPlatform","type":"MethodDefinition","paramnames":["platform"]},"vars":{"":null}},"description":"WIP Sets the platform of the object. This will be used when platforms will be fully implemented.","params":[{"type":{"names":["Drawable"]},"description":"The platform the object is attached to.","name":"platform"}],"name":"setPlatform","longname":"Menu#setPlatform","kind":"function","memberof":"Menu","scope":"instance","inherits":"Drawable#setPlatform","inherited":true,"$longname":"Menu#setPlatform"},{"comment":"/**\n     * Change the scale of the object\n     *\n     * @param {number} scale The new scale of the object.\n     *\n     * @note: it's only used when rendering, collision detection is not using the scale yet.\n     */","meta":{"range":[13819,13870],"filename":"Drawable.js","lineno":489,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002712","name":"Drawable#setScale","type":"MethodDefinition","paramnames":["scale"]},"vars":{"":null}},"description":"Change the scale of the object","params":[{"type":{"names":["number"]},"description":"The new scale of the object.","name":"scale"}],"tags":[{"originalTitle":"note:","title":"note:","text":"it's only used when rendering, collision detection is not using the scale yet.","value":"it's only used when rendering, collision detection is not using the scale yet."}],"name":"setScale","longname":"Menu#setScale","kind":"function","memberof":"Menu","scope":"instance","inherits":"Drawable#setScale","inherited":true,"$longname":"Menu#setScale"},{"comment":"/**\n     * Sets the scene of the object.\n     *\n     * @param {Scene} scene The scene of the object.\n     *\n     * @note you don't usually need to call this method as it's called when adding an object onto a scene.\n     */","meta":{"range":[5516,5665],"filename":"Drawable.js","lineno":191,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001943","name":"Drawable#setScene","type":"MethodDefinition","paramnames":["scene"]},"vars":{"":null}},"description":"Sets the scene of the object.","params":[{"type":{"names":["Scene"]},"description":"The scene of the object.","name":"scene"}],"tags":[{"originalTitle":"note","title":"note","text":"you don't usually need to call this method as it's called when adding an object onto a scene.","value":"you don't usually need to call this method as it's called when adding an object onto a scene."}],"name":"setScene","longname":"Menu#setScene","kind":"function","memberof":"Menu","scope":"instance","inherits":"Drawable#setScene","inherited":true,"$longname":"Menu#setScene"},{"comment":"/**\n     * Updates the text of a menu item\n     *\n     * @param {Number} itemId The index of the item to modify.\n     * @param {String} text The new text.\n     *\n     */","meta":{"range":[4163,4231],"filename":"Menu.js","lineno":153,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100004474","name":"Menu#setText","type":"MethodDefinition","paramnames":["itemId","text"]},"vars":{"":null}},"description":"Updates the text of a menu item","params":[{"type":{"names":["Number"]},"description":"The index of the item to modify.","name":"itemId"},{"type":{"names":["String"]},"description":"The new text.","name":"text"}],"name":"setText","longname":"Menu#setText","kind":"function","memberof":"Menu","scope":"instance","$longname":"Menu#setText"},{"comment":"/**\n     * Show the object\n     *\n     * @returns {Drawable} this\n     */","meta":{"range":[14860,14925],"filename":"Drawable.js","lineno":543,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002771","name":"Drawable#show","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Show the object","returns":[{"type":{"names":["Drawable"]},"description":"this"}],"name":"show","longname":"Menu#show","kind":"function","memberof":"Menu","scope":"instance","params":[],"inherits":"Drawable#show","inherited":true,"$longname":"Menu#show"},{"comment":"/**\n     * Draws the sprite hit box\n     *\n     * @param {RenderingContext} The canvas context where to render the hitbox.\n     */","meta":{"range":[16663,18176],"filename":"Drawable.js","lineno":617,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002857","name":"Drawable#showHitBox","type":"MethodDefinition","paramnames":["ctx"]},"vars":{"":null}},"description":"Draws the sprite hit box","params":[{"type":{"names":["RenderingContext"]},"description":"canvas context where to render the hitbox.","name":"The"}],"name":"showHitBox","longname":"Menu#showHitBox","kind":"function","memberof":"Menu","scope":"instance","inherits":"Drawable#showHitBox","inherited":true,"$longname":"Menu#showHitBox"},{"comment":"/**\n       * Draws a box around objects. This method is called when debugging is enabled.\n       *\n       * @param {RenderingContext} ctx The context where to draw the box.\n       */","meta":{"range":[18369,18743],"filename":"Drawable.js","lineno":656,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003054","name":"Drawable#showObjectBox","type":"MethodDefinition","paramnames":["ctx"]},"vars":{"":null}},"description":"Draws a box around objects. This method is called when debugging is enabled.","params":[{"type":{"names":["RenderingContext"]},"description":"The context where to draw the box.","name":"ctx"}],"name":"showObjectBox","longname":"Menu#showObjectBox","kind":"function","memberof":"Menu","scope":"instance","inherits":"Drawable#showObjectBox","inherited":true,"$longname":"Menu#showObjectBox"},{"comment":"/**\n     * Moves the object by snapping it to the map tiles\n     *\n     * @param {Boolean} isLeft Should we snap to the left?\n     * @param {Boolean} isUp Should we snap to the right?\n     */","meta":{"range":[7193,7743],"filename":"Drawable.js","lineno":248,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002106","name":"Drawable#snapToMap","type":"MethodDefinition","paramnames":["isLeft","isUp"]},"vars":{"":null}},"description":"Moves the object by snapping it to the map tiles","params":[{"type":{"names":["Boolean"]},"description":"Should we snap to the left?","name":"isLeft"},{"type":{"names":["Boolean"]},"description":"Should we snap to the right?","name":"isUp"}],"name":"snapToMap","longname":"Menu#snapToMap","kind":"function","memberof":"Menu","scope":"instance","inherits":"Drawable#snapToMap","inherited":true,"$longname":"Menu#snapToMap"},{"comment":"/**\n     * Stops current running animation\n     *\n     * In some cases, the game may need to stop effects from running before\n     * they are completed. This method proves a way to do so and set an end value.\n     *\n     * @param {any} setEndValue The end value of the animation.\n     */","meta":{"range":[23545,23877],"filename":"Drawable.js","lineno":821,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003608","name":"Drawable#stopAnimate","type":"MethodDefinition","paramnames":["setEndValue"]},"vars":{"":null}},"description":"Stops current running animation\n\nIn some cases, the game may need to stop effects from running before\nthey are completed. This method proves a way to do so and set an end value.","params":[{"type":{"names":["any"]},"description":"The end value of the animation.","name":"setEndValue"}],"name":"stopAnimate","longname":"Menu#stopAnimate","kind":"function","memberof":"Menu","scope":"instance","inherits":"Drawable#stopAnimate","inherited":true,"$longname":"Menu#stopAnimate"}],"$constructor":{"comment":"/**\n     * Creates a new Menu\n     *\n     * @param {String} type The type of object.\n     * @param {Object} options\n     * @param {String} [options.title=\"Menu Title\"] The title of the menu.\n     * @param {String} [options.color=\"black\"] The color of the menu.\n     * @param {Array} [options.menuItems=[]] The menu items to add.\n     * @param {String} [options.selectedColor=\"red\"] The default color to use for the selected menu item.\n     *\n     * @example\n     *\n     * let myMenu = new Menu('mainMenu', {\n     *   title: 'Gods JS',\n     *      color: 'white',\n     *      menuItems: [\n     *      {\n     *          text: '> Start Game',\n     *          selectable: true,\n     *          visible: true,\n     *          active: true\n     *      },\n     *      {\n     *          text: '> Cannot Select ;)',\n     *          selectable: true,\n     *          visible: true\n     *      }]\n     *    })\n     */","meta":{"range":[1308,2072],"filename":"Menu.js","lineno":42,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100004176","name":"Menu","type":"MethodDefinition","paramnames":["type","options"]},"vars":{"":null}},"description":"Creates a new Menu","params":[{"type":{"names":["String"]},"description":"The type of object.","name":"type"},{"type":{"names":["Object"]},"name":"options"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"Menu Title\"","description":"The title of the menu.","name":"options.title"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"black\"","description":"The color of the menu.","name":"options.color"},{"type":{"names":["Array"]},"optional":true,"defaultvalue":"[]","description":"The menu items to add.","name":"options.menuItems"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"red\"","description":"The default color to use for the selected menu item.","name":"options.selectedColor"}],"examples":["let myMenu = new Menu('mainMenu', {\n  title: 'Gods JS',\n     color: 'white',\n     menuItems: [\n     {\n         text: '> Start Game',\n         selectable: true,\n         visible: true,\n         active: true\n     },\n     {\n         text: '> Cannot Select ;)',\n         selectable: true,\n         visible: true\n     }]\n   })"],"name":"Menu","longname":"Menu","kind":"class","scope":"global","undocumented":true,"$longname":"Menu"}},{"comment":"/**\n * Very basic wrapper for canvas drawing methods\n * Incomplete: missing translate, rotates, scale support\n *\n * @extends Drawable\n */","meta":{"range":[215,5022],"filename":"Paint.js","lineno":10,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100004588","name":"Paint","type":"ClassDeclaration","paramnames":["name","options"]}},"classdesc":"Very basic wrapper for canvas drawing methods\nIncomplete: missing translate, rotates, scale support","augments":["Drawable"],"name":"Paint","longname":"Paint","kind":"class","scope":"global","description":"Creates a new Paint instance","params":[{"type":{"names":["String"]},"description":"The name of the Paint element.","name":"name"},{"type":{"names":["Object"]},"name":"options"},{"type":{"names":["Number"]},"optional":true,"description":"The width of the Paint element.","name":"options.width"},{"type":{"names":["Number"]},"optional":true,"description":"The height of the Paint element.","name":"options.height"},{"type":{"names":["Number"]},"optional":true,"description":"The horizontal position of the element.","name":"options.x"},{"type":{"names":["Number"]},"optional":true,"description":"The vertical position of the element.","name":"options.y"},{"type":{"names":["String"]},"optional":true,"description":"The color of the element. Can be changed by subsequent drawing method calls.","name":"options.color"}],"$longname":"Paint","$members":[{"comment":"/**\n     * Add a new Child to the object.\n     *\n     * Childs are automatically rendered and moved when the parent object is.\n     *\n     * @param {Drawable} child The child to add.\n     *\n     * @note children are automatically added to the scene/map of the parent object.\n     */","meta":{"range":[24998,25139],"filename":"Drawable.js","lineno":877,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003691","name":"Drawable#addChild","type":"MethodDefinition","paramnames":["child"]},"vars":{"":null}},"description":"Add a new Child to the object.\n\nChilds are automatically rendered and moved when the parent object is.","params":[{"type":{"names":["Drawable"]},"description":"The child to add.","name":"child"}],"tags":[{"originalTitle":"note","title":"note","text":"children are automatically added to the scene/map of the parent object.","value":"children are automatically added to the scene/map of the parent object."}],"name":"addChild","longname":"Paint#addChild","kind":"function","memberof":"Paint","scope":"instance","inherits":"Drawable#addChild","inherited":true,"$longname":"Paint#addChild"},{"comment":"/**\n     * Add a new handler to be called after each move of the object\n     *\n     * @param {Function} cb The callback to add.\n     */","meta":{"range":[20765,20827],"filename":"Drawable.js","lineno":731,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003406","name":"Drawable#addMoveHandler","type":"MethodDefinition","paramnames":["cb"]},"vars":{"":null}},"description":"Add a new handler to be called after each move of the object","params":[{"type":{"names":["function"]},"description":"The callback to add.","name":"cb"}],"name":"addMoveHandler","longname":"Paint#addMoveHandler","kind":"function","memberof":"Paint","scope":"instance","inherits":"Drawable#addMoveHandler","inherited":true,"$longname":"Paint#addMoveHandler"},{"comment":"/**\n     * Since the Paint Drawable only supports the Fade effect, we override\n     * the Drawable's animate method and print a warning in case the user\n     * attempts to run an unsupported animation.\n     *\n     * @param {String} name The name of the animation to run.\n     * @param {Object} options\n     */","meta":{"range":[4746,5020],"filename":"Paint.js","lineno":148,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100004945","name":"Paint#animate","type":"MethodDefinition","paramnames":["name","options"]},"vars":{"":null}},"description":"Since the Paint Drawable only supports the Fade effect, we override\nthe Drawable's animate method and print a warning in case the user\nattempts to run an unsupported animation.","params":[{"type":{"names":["String"]},"description":"The name of the animation to run.","name":"name"},{"type":{"names":["Object"]},"name":"options"}],"name":"animate","longname":"Paint#animate","kind":"function","memberof":"Paint","scope":"instance","overrides":"Drawable#animate","$longname":"Paint#animate"},{"comment":"/**\n     * Draws an arc\n     *\n     * @param {Number} x The arc's center x position, related to the Paint's position.\n     * @param {Number} y The arc's center y position, related to the Paint's position.\n     * @param {Number} radius The arc's radius, in radian.\n     * @param {Number} startAngle The arc's start angle, in radian.\n     * @param {Number} endAngle The arc's send angle, in radian.\n     * @param {String} strokeStyle The arc's stroke style.\n     * @param {Number} strokeWidth The arc's line width.\n     */","meta":{"range":[4107,4426],"filename":"Paint.js","lineno":130,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100004883","name":"Paint#arc","type":"MethodDefinition","paramnames":["x","y","radius","startAngle","endAngle","strokeStyle","strokeWidth"]},"vars":{"":null}},"description":"Draws an arc","params":[{"type":{"names":["Number"]},"description":"The arc's center x position, related to the Paint's position.","name":"x"},{"type":{"names":["Number"]},"description":"The arc's center y position, related to the Paint's position.","name":"y"},{"type":{"names":["Number"]},"description":"The arc's radius, in radian.","name":"radius"},{"type":{"names":["Number"]},"description":"The arc's start angle, in radian.","name":"startAngle"},{"type":{"names":["Number"]},"description":"The arc's send angle, in radian.","name":"endAngle"},{"type":{"names":["String"]},"description":"The arc's stroke style.","name":"strokeStyle"},{"type":{"names":["Number"]},"description":"The arc's line width.","name":"strokeWidth"}],"name":"arc","longname":"Paint#arc","kind":"function","memberof":"Paint","scope":"instance","$longname":"Paint#arc"},{"comment":"/**\n     * Stops the object from moving, optionnaly immediately going to target position\n     *\n     * @param {Boolean} [gotoTarget=false] Set to true to go to the target position.\n     */","meta":{"range":[8766,8998],"filename":"Drawable.js","lineno":305,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002243","name":"Drawable#cancelMoveTo","type":"MethodDefinition","paramnames":["gotoTarget"]},"vars":{"":null}},"description":"Stops the object from moving, optionnaly immediately going to target position","params":[{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"Set to true to go to the target position.","name":"gotoTarget"}],"name":"cancelMoveTo","longname":"Paint#cancelMoveTo","kind":"function","memberof":"Paint","scope":"instance","inherits":"Drawable#cancelMoveTo","inherited":true,"$longname":"Paint#cancelMoveTo"},{"comment":"/**\n     * Centers the object into the scene.\n     *\n     * @returns {Drawable} this\n     */","meta":{"range":[9101,9292],"filename":"Drawable.js","lineno":320,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002280","name":"Drawable#center","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Centers the object into the scene.","returns":[{"type":{"names":["Drawable"]},"description":"this"}],"name":"center","longname":"Paint#center","kind":"function","memberof":"Paint","scope":"instance","params":[],"inherits":"Drawable#center","inherited":true,"$longname":"Paint#center"},{"comment":"/**\n     * Draws a circle\n     *\n     * @param {Number} x The circle's center x related to the Paint's position.\n     * @param {Number} y The circle's center y related to the Paint's position.\n     * @param {Number} radius The circle's radius in radian.\n     * @param {String} color The circle's color.\n     * @param {Number} strokeWidth The circle's line width.\n     * @param {String} strokeStyle The circle's strokeStyle.\n     */","meta":{"range":[3133,3576],"filename":"Paint.js","lineno":104,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100004792","name":"Paint#circle","type":"MethodDefinition","paramnames":["x","y","radius","color","strokeWidth","strokeStyle"]},"vars":{"":null}},"description":"Draws a circle","params":[{"type":{"names":["Number"]},"description":"The circle's center x related to the Paint's position.","name":"x"},{"type":{"names":["Number"]},"description":"The circle's center y related to the Paint's position.","name":"y"},{"type":{"names":["Number"]},"description":"The circle's radius in radian.","name":"radius"},{"type":{"names":["String"]},"description":"The circle's color.","name":"color"},{"type":{"names":["Number"]},"description":"The circle's line width.","name":"strokeWidth"},{"type":{"names":["String"]},"description":"The circle's strokeStyle.","name":"strokeStyle"}],"name":"circle","longname":"Paint#circle","kind":"function","memberof":"Paint","scope":"instance","$longname":"Paint#circle"},{"comment":"/**\n     * Stop using a particular behavior.\n     *\n     * The vx and vy properties of the object will be set to zero.\n     */","meta":{"range":[10033,10117],"filename":"Drawable.js","lineno":349,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002359","name":"Drawable#clearBehavior","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Stop using a particular behavior.\n\nThe vx and vy properties of the object will be set to zero.","name":"clearBehavior","longname":"Paint#clearBehavior","kind":"function","memberof":"Paint","scope":"instance","params":[],"inherits":"Drawable#clearBehavior","inherited":true,"$longname":"Paint#clearBehavior"},{"comment":"/**\n     * Destroy is called when an object is removed from a scene or object\n     *\n     * @note calling destroy on a parent will automatically call the destroy method of each child.\n     */","meta":{"range":[28118,28636],"filename":"Drawable.js","lineno":984,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003963","name":"Drawable#destroy","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Destroy is called when an object is removed from a scene or object","tags":[{"originalTitle":"note","title":"note","text":"calling destroy on a parent will automatically call the destroy method of each child.","value":"calling destroy on a parent will automatically call the destroy method of each child."}],"name":"destroy","longname":"Paint#destroy","kind":"function","memberof":"Paint","scope":"instance","params":[],"inherits":"Drawable#destroy","inherited":true,"$longname":"Paint#destroy"},{"comment":"/**\n     * Fills the Paint with specified color\n     *\n     * @param {String} [color=this.color] The color to used for filling the Paint.\n     */","meta":{"range":[1995,2132],"filename":"Paint.js","lineno":73,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100004714","name":"Paint#fill","type":"MethodDefinition","paramnames":["color"]},"vars":{"":null}},"description":"Fills the Paint with specified color","params":[{"type":{"names":["String"]},"optional":true,"defaultvalue":"this.color","description":"The color to used for filling the Paint.","name":"color"}],"name":"fill","longname":"Paint#fill","kind":"function","memberof":"Paint","scope":"instance","$longname":"Paint#fill"},{"comment":"/**\n     * Returns the angle property of the object.\n     * \n     * @returns {Number} The angle of the object\n     */","meta":{"range":[14335,14380],"filename":"Drawable.js","lineno":510,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002734","name":"Drawable#getAngle","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the angle property of the object.","returns":[{"type":{"names":["Number"]},"description":"The angle of the object"}],"name":"getAngle","longname":"Paint#getAngle","kind":"function","memberof":"Paint","scope":"instance","params":[],"inherits":"Drawable#getAngle","inherited":true,"$longname":"Paint#getAngle"},{"comment":"/**\n     * Returns the current height of the object: with some types of Drawables ({Sprite}),\n     * height can vary\n     *\n     * @returns {number} The current height of the object\n     *\n     * @related {Sprite}\n     */","meta":{"range":[16065,16119],"filename":"Drawable.js","lineno":592,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002825","name":"Drawable#getCurrentHeight","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the current height of the object: with some types of Drawables ({Sprite}),\nheight can vary","returns":[{"type":{"names":["number"]},"description":"The current height of the object"}],"tags":[{"originalTitle":"related","title":"related","text":"{Sprite}","value":"{Sprite}"}],"name":"getCurrentHeight","longname":"Paint#getCurrentHeight","kind":"function","memberof":"Paint","scope":"instance","params":[],"inherits":"Drawable#getCurrentHeight","inherited":true,"$longname":"Paint#getCurrentHeight"},{"comment":"/**\n     * Returns the current width of the drawable: with some types of drawables ({Sprite}),\n     * width can vary\n     *\n     * @returns {number} The current width of the object\n     *\n     * @related {Sprite}\n     */","meta":{"range":[15781,15833],"filename":"Drawable.js","lineno":580,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002817","name":"Drawable#getCurrentWidth","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the current width of the drawable: with some types of drawables ({Sprite}),\nwidth can vary","returns":[{"type":{"names":["number"]},"description":"The current width of the object"}],"tags":[{"originalTitle":"related","title":"related","text":"{Sprite}","value":"{Sprite}"}],"name":"getCurrentWidth","longname":"Paint#getCurrentWidth","kind":"function","memberof":"Paint","scope":"instance","params":[],"inherits":"Drawable#getCurrentWidth","inherited":true,"$longname":"Paint#getCurrentWidth"},{"comment":"/**\n     * Returns the object's hitbox.\n     *\n     * Some drawables (eg. {Sprite} may have different hitbox for different frames.\n     *\n     * @returns {Object} an object with x, y, x2, Y2 describing the hit box\n     */","meta":{"range":[16351,16522],"filename":"Drawable.js","lineno":603,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002833","name":"Drawable#getHitBox","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the object's hitbox.\n\nSome drawables (eg. {Sprite} may have different hitbox for different frames.","returns":[{"type":{"names":["Object"]},"description":"an object with x, y, x2, Y2 describing the hit box"}],"name":"getHitBox","longname":"Paint#getHitBox","kind":"function","memberof":"Paint","scope":"instance","params":[],"inherits":"Drawable#getHitBox","inherited":true,"$longname":"Paint#getHitBox"},{"comment":"/**\n     * Returns the current opacity of the object\n     *\n     * @returns {number} The current opacity value.\n     */","meta":{"range":[8518,8567],"filename":"Drawable.js","lineno":296,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002235","name":"Drawable#getOpacity","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the current opacity of the object","returns":[{"type":{"names":["number"]},"description":"The current opacity value."}],"name":"getOpacity","longname":"Paint#getOpacity","kind":"function","memberof":"Paint","scope":"instance","params":[],"inherits":"Drawable#getOpacity","inherited":true,"$longname":"Paint#getOpacity"},{"comment":"/**\n     * Returns previously seved position\n     *\n     * @returns {Object} The saved position\n     */","meta":{"range":[13162,13271],"filename":"Drawable.js","lineno":455,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002683","name":"Drawable#getSavedPosition","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns previously seved position","returns":[{"type":{"names":["Object"]},"description":"The saved position"}],"name":"getSavedPosition","longname":"Paint#getSavedPosition","kind":"function","memberof":"Paint","scope":"instance","params":[],"inherits":"Drawable#getSavedPosition","inherited":true,"$longname":"Paint#getSavedPosition"},{"comment":"/**\n     * Hides the object\n     *\n     * @returns {Drawable} this\n     */","meta":{"range":[14710,14776],"filename":"Drawable.js","lineno":532,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002759","name":"Drawable#hide","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Hides the object","returns":[{"type":{"names":["Drawable"]},"description":"this"}],"name":"hide","longname":"Paint#hide","kind":"function","memberof":"Paint","scope":"instance","params":[],"inherits":"Drawable#hide","inherited":true,"$longname":"Paint#hide"},{"comment":"/**\n     * Performs collision tests on the specifed object.\n     *\n     * @param {Drawable} obj The object to perform test on\n     *\n     * @returns {Boolean} Returns true if this and obj collide\n     */","meta":{"range":[19080,20353],"filename":"Drawable.js","lineno":678,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003151","name":"Drawable#hitTest","type":"MethodDefinition","paramnames":["obj"]},"vars":{"":null}},"description":"Performs collision tests on the specifed object.","params":[{"type":{"names":["Drawable"]},"description":"The object to perform test on","name":"obj"}],"returns":[{"type":{"names":["Boolean"]},"description":"Returns true if this and obj collide"}],"name":"hitTest","longname":"Paint#hitTest","kind":"function","memberof":"Paint","scope":"instance","inherits":"Drawable#hitTest","inherited":true,"$longname":"Paint#hitTest"},{"comment":"/**\n     * Moves the object to a new destination.\n     *\n     * @param {number} x The new horizontal position.\n     * @param {number} y The new vertical position.\n     * @param {number} [duration=0] The duration of the move, 0 to have the object move immediately to new position.\n     *\n     * @returns {Drawable} this\n     */","meta":{"range":[6272,6991],"filename":"Drawable.js","lineno":217,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001981","name":"Drawable#moveTo","type":"MethodDefinition","paramnames":["x","y","duration"]},"vars":{"":null}},"description":"Moves the object to a new destination.","params":[{"type":{"names":["number"]},"description":"The new horizontal position.","name":"x"},{"type":{"names":["number"]},"description":"The new vertical position.","name":"y"},{"type":{"names":["number"]},"optional":true,"defaultvalue":0,"description":"The duration of the move, 0 to have the object move immediately to new position.","name":"duration"}],"returns":[{"type":{"names":["Drawable"]},"description":"this"}],"name":"moveTo","longname":"Paint#moveTo","kind":"function","memberof":"Paint","scope":"instance","inherits":"Drawable#moveTo","inherited":true,"$longname":"Paint#moveTo"},{"comment":"/**\n     * Sends a notification to listeners\n     *\n     * @note: this is a simple wrapper to the NotificationManageger's notify method\n     *\n     * @param {String} id name of the event to send\n     * @param {Object} data data to send with the event, default = empty object\n     */","meta":{"range":[27760,27836],"filename":"Drawable.js","lineno":973,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003941","name":"Drawable#notify","type":"MethodDefinition","paramnames":["id","data"]},"vars":{"":null}},"description":"Sends a notification to listeners","tags":[{"originalTitle":"note:","title":"note:","text":"this is a simple wrapper to the NotificationManageger's notify method","value":"this is a simple wrapper to the NotificationManageger's notify method"}],"params":[{"type":{"names":["String"]},"description":"name of the event to send","name":"id"},{"type":{"names":["Object"]},"description":"data to send with the event, default = empty object","name":"data"}],"name":"notify","longname":"Paint#notify","kind":"function","memberof":"Paint","scope":"instance","inherits":"Drawable#notify","inherited":true,"$longname":"Paint#notify"},{"comment":"/**\n     * onCollision is called on each collision with the object.\n     *\n     * This method does nothing and should be extended if needed.\n     *\n     */","meta":{"range":[24683,24705],"filename":"Drawable.js","lineno":864,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003687","name":"Drawable#onCollision","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"onCollision is called on each collision with the object.\n\nThis method does nothing and should be extended if needed.","name":"onCollision","longname":"Paint#onCollision","kind":"function","memberof":"Paint","scope":"instance","params":[],"inherits":"Drawable#onCollision","inherited":true,"$longname":"Paint#onCollision"},{"comment":"/**\n     * onHit is called when the object collides with another object\n     *\n     * @param {Drawable} obj The object that collided.\n     *\n     * This function does nothing interesting: this should be extended if needed.\n     */","meta":{"range":[21068,21203],"filename":"Drawable.js","lineno":742,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003419","name":"Drawable#onHit","type":"MethodDefinition","paramnames":["obj"]},"vars":{"":null}},"description":"onHit is called when the object collides with another object","params":[{"type":{"names":["Drawable"]},"description":"The object that collided.\n\nThis function does nothing interesting: this should be extended if needed.","name":"obj"}],"name":"onHit","longname":"Paint#onHit","kind":"function","memberof":"Paint","scope":"instance","inherits":"Drawable#onHit","inherited":true,"$longname":"Paint#onHit"},{"comment":"/**\n     * Plays the spcified sound\n     *\n     * @param {String} id The id of the sound to play.\n     * @param {Object} options\n     * @param {Boolean} [options.pan=true] Set pan to true if you want to use panning.\n     * @param {Boolean} [options.loop=false] Set to true to loop the sound.\n     */","meta":{"range":[26781,27467],"filename":"Drawable.js","lineno":943,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003823","name":"Drawable#playSound","type":"MethodDefinition","paramnames":["id","options"]},"vars":{"":null}},"description":"Plays the spcified sound","params":[{"type":{"names":["String"]},"description":"The id of the sound to play.","name":"id"},{"type":{"names":["Object"]},"name":"options"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":true,"description":"Set pan to true if you want to use panning.","name":"options.pan"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"Set to true to loop the sound.","name":"options.loop"}],"name":"playSound","longname":"Paint#playSound","kind":"function","memberof":"Paint","scope":"instance","inherits":"Drawable#playSound","inherited":true,"$longname":"Paint#playSound"},{"comment":"/**\n     * Draws a rectangle\n     *\n     * @param {Number} x The rect's x related to the Paint'x position.\n     * @param {Number} y The rect's y related to the Paint'x position.\n     * @param {Number} width The width of the rectangle.\n     * @param {Number} height The height of the rectangle.\n     * @param {String} [color=this.color] The color of the rectangle.\n     */","meta":{"range":[2514,2691],"filename":"Paint.js","lineno":87,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100004750","name":"Paint#rect","type":"MethodDefinition","paramnames":["x","y","width","height","color"]},"vars":{"":null}},"description":"Draws a rectangle","params":[{"type":{"names":["Number"]},"description":"The rect's x related to the Paint'x position.","name":"x"},{"type":{"names":["Number"]},"description":"The rect's y related to the Paint'x position.","name":"y"},{"type":{"names":["Number"]},"description":"The width of the rectangle.","name":"width"},{"type":{"names":["Number"]},"description":"The height of the rectangle.","name":"height"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"this.color","description":"The color of the rectangle.","name":"color"}],"name":"rect","longname":"Paint#rect","kind":"function","memberof":"Paint","scope":"instance","$longname":"Paint#rect"},{"comment":"/**\n     * Remove every children from the object.\n     */","meta":{"range":[25612,25780],"filename":"Drawable.js","lineno":903,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003759","name":"Drawable#removeAllChildren","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Remove every children from the object.","name":"removeAllChildren","longname":"Paint#removeAllChildren","kind":"function","memberof":"Paint","scope":"instance","params":[],"inherits":"Drawable#removeAllChildren","inherited":true,"$longname":"Paint#removeAllChildren"},{"comment":"/**\n     * Remove a child from the object\n     *\n     * @param {Drawable} child The child to remove from the object.\n     *\n     * @note: removing a child object will call its `destroy` method.\n     */","meta":{"range":[25351,25544],"filename":"Drawable.js","lineno":891,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003720","name":"Drawable#removeChild","type":"MethodDefinition","paramnames":["child"]},"vars":{"":null}},"description":"Remove a child from the object","params":[{"type":{"names":["Drawable"]},"description":"The child to remove from the object.","name":"child"}],"tags":[{"originalTitle":"note:","title":"note:","text":"removing a child object will call its `destroy` method.","value":"removing a child object will call its `destroy` method."}],"name":"removeChild","longname":"Paint#removeChild","kind":"function","memberof":"Paint","scope":"instance","inherits":"Drawable#removeChild","inherited":true,"$longname":"Paint#removeChild"},{"comment":"/**\n     * The render method is called at each frame.\n     *\n     * User should redefine this and put there needed drawing calls\n     */","meta":{"range":[1822,1839],"filename":"Paint.js","lineno":64,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100004710","name":"Paint#render","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"The render method is called at each frame.\n\nUser should redefine this and put there needed drawing calls","name":"render","longname":"Paint#render","kind":"function","memberof":"Paint","scope":"instance","params":[],"$longname":"Paint#render"},{"comment":"/**\n     * User customized reset method\n     */","meta":{"range":[3584,3600],"filename":"Drawable.js","lineno":119,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001682","name":"Drawable#reset","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"User customized reset method","name":"reset","longname":"Paint#reset","kind":"function","memberof":"Paint","scope":"instance","params":[],"inherits":"Drawable#reset","inherited":true,"$longname":"Paint#reset"},{"comment":"/**\n     * Restores the previous context globalAlpha property.\n     *\n     * @param {RenderingContext} ctx The context.\n     */","meta":{"range":[15480,15550],"filename":"Drawable.js","lineno":568,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002804","name":"Drawable#restoreCtxAlpha","type":"MethodDefinition","paramnames":["ctx"]},"vars":{"":null}},"description":"Restores the previous context globalAlpha property.","params":[{"type":{"names":["RenderingContext"]},"description":"The context.","name":"ctx"}],"name":"restoreCtxAlpha","longname":"Paint#restoreCtxAlpha","kind":"function","memberof":"Paint","scope":"instance","inherits":"Drawable#restoreCtxAlpha","inherited":true,"$longname":"Paint#restoreCtxAlpha"},{"comment":"/**\n     * Saves current object position into `savedX` and `savedY` properties\n     */","meta":{"range":[12966,13048],"filename":"Drawable.js","lineno":445,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002663","name":"Drawable#savePosition","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Saves current object position into `savedX` and `savedY` properties","name":"savePosition","longname":"Paint#savePosition","kind":"function","memberof":"Paint","scope":"instance","params":[],"inherits":"Drawable#savePosition","inherited":true,"$longname":"Paint#savePosition"},{"comment":"/**\n     * Change the angle of an object\n     *\n     * @param {number} angle The new angle of the object. 0 < angle < 360.\n     *\n     * @note This property is only used for the rendering and it's ignored for collisions.\n     */","meta":{"range":[14109,14207],"filename":"Drawable.js","lineno":500,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002723","name":"Drawable#setAngle","type":"MethodDefinition","paramnames":["angle"]},"vars":{"":null}},"description":"Change the angle of an object","params":[{"type":{"names":["number"]},"description":"The new angle of the object. 0 < angle < 360.","name":"angle"}],"tags":[{"originalTitle":"note","title":"note","text":"This property is only used for the rendering and it's ignored for collisions.","value":"This property is only used for the rendering and it's ignored for collisions."}],"name":"setAngle","longname":"Paint#setAngle","kind":"function","memberof":"Paint","scope":"instance","inherits":"Drawable#setAngle","inherited":true,"$longname":"Paint#setAngle"},{"comment":"/**\n     * Sets a new behavior to the object: this will be called in the move loop\n     *\n     * @param {(String|Behavior)} behavior Either the name of a standard behavior or a Behavior class to use.\n     * @param {Object} [options={}] The options of the behavior (may depend on the behavior type).\n     *\n     * @related {Behavior}\n     */","meta":{"range":[9643,9896],"filename":"Drawable.js","lineno":336,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002322","name":"Drawable#setBehavior","type":"MethodDefinition","paramnames":["behavior","options"]},"vars":{"":null}},"description":"Sets a new behavior to the object: this will be called in the move loop","params":[{"type":{"names":["String","Behavior"]},"description":"Either the name of a standard behavior or a Behavior class to use.","name":"behavior"},{"type":{"names":["Object"]},"optional":true,"defaultvalue":"{}","description":"The options of the behavior (may depend on the behavior type).","name":"options"}],"tags":[{"originalTitle":"related","title":"related","text":"{Behavior}","value":"{Behavior}"}],"name":"setBehavior","longname":"Paint#setBehavior","kind":"function","memberof":"Paint","scope":"instance","inherits":"Drawable#setBehavior","inherited":true,"$longname":"Paint#setBehavior"},{"comment":"/**\n     * Associates an image to the drawable.\n     *\n     * Some objects (eg. Sprite) need a source sheet image before being able to\n     * be rendered onto the display.\n     *\n     * @param {Image} image the image that this object needs to draw: redefine if needed\n     */","meta":{"range":[26066,26090],"filename":"Drawable.js","lineno":918,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003795","name":"Drawable#setImage","type":"MethodDefinition","paramnames":["image"]},"vars":{"":null}},"description":"Associates an image to the drawable.\n\nSome objects (eg. Sprite) need a source sheet image before being able to\nbe rendered onto the display.","params":[{"type":{"names":["Image"]},"description":"the image that this object needs to draw: redefine if needed","name":"image"}],"name":"setImage","longname":"Paint#setImage","kind":"function","memberof":"Paint","scope":"instance","inherits":"Drawable#setImage","inherited":true,"$longname":"Paint#setImage"},{"comment":"/**\n     * Sets the map of the object.\n     *\n     * @param {Map} map The map of the object.\n     *\n     * @note you don't usually need to call this method as it's called automatically when adding an object\n     * onto a map.\n     *\n     */","meta":{"range":[5146,5283],"filename":"Drawable.js","lineno":176,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001916","name":"Drawable#setMap","type":"MethodDefinition","paramnames":["map"]},"vars":{"":null}},"description":"Sets the map of the object.","params":[{"type":{"names":["Map"]},"description":"The map of the object.","name":"map"}],"tags":[{"originalTitle":"note","title":"note","text":"you don't usually need to call this method as it's called automatically when adding an object\nonto a map.","value":"you don't usually need to call this method as it's called automatically when adding an object\nonto a map."}],"name":"setMap","longname":"Paint#setMap","kind":"function","memberof":"Paint","scope":"instance","inherits":"Drawable#setMap","inherited":true,"$longname":"Paint#setMap"},{"comment":"/**\n     * Applies a new mask to the object, clipping its drawing onto the scene/map\n     *\n     * @param {Object} mask The new mask to use, set to null to remove the mask.\n     * @param {Boolean} exclude Set to true to have the mask exclude portions of the drawing, in this case mask.color will be used.\n     */","meta":{"range":[8066,8211],"filename":"Drawable.js","lineno":275,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002197","name":"Drawable#setMask","type":"MethodDefinition","paramnames":["mask","exclude"]},"vars":{"":null}},"description":"Applies a new mask to the object, clipping its drawing onto the scene/map","params":[{"type":{"names":["Object"]},"description":"The new mask to use, set to null to remove the mask.","name":"mask","defaultvalue":null},{"type":{"names":["Boolean"]},"description":"Set to true to have the mask exclude portions of the drawing, in this case mask.color will be used.","name":"exclude","defaultvalue":false}],"name":"setMask","longname":"Paint#setMask","kind":"function","memberof":"Paint","scope":"instance","inherits":"Drawable#setMask","inherited":true,"$longname":"Paint#setMask"},{"comment":"/**\n     * Changes the opacity of the object\n     *\n     * @param {number} opacity The new opacity.\n     */","meta":{"range":[8329,8388],"filename":"Drawable.js","lineno":287,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002224","name":"Drawable#setOpacity","type":"MethodDefinition","paramnames":["opacity"]},"vars":{"":null}},"description":"Changes the opacity of the object","params":[{"type":{"names":["number"]},"description":"The new opacity.","name":"opacity"}],"name":"setOpacity","longname":"Paint#setOpacity","kind":"function","memberof":"Paint","scope":"instance","inherits":"Drawable#setOpacity","inherited":true,"$longname":"Paint#setOpacity"},{"comment":"/**\n     * Sets a new path for the object\n     *\n     * @param {Path} path The new path that the object will use when moving.\n     *\n     * @related {Path}\n     */","meta":{"range":[13547,13594],"filename":"Drawable.js","lineno":478,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002701","name":"Drawable#setPath","type":"MethodDefinition","paramnames":["path"]},"vars":{"":null}},"description":"Sets a new path for the object","params":[{"type":{"names":["Path"]},"description":"The new path that the object will use when moving.","name":"path"}],"tags":[{"originalTitle":"related","title":"related","text":"{Path}","value":"{Path}"}],"name":"setPath","longname":"Paint#setPath","kind":"function","memberof":"Paint","scope":"instance","inherits":"Drawable#setPath","inherited":true,"$longname":"Paint#setPath"},{"comment":"/**\n     * WIP Sets the platform of the object. This will be used when platforms will be fully implemented.\n     *\n     * @param {Drawable} platform The platform the object is attached to.\n     */","meta":{"range":[5872,5935],"filename":"Drawable.js","lineno":204,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001970","name":"Drawable#setPlatform","type":"MethodDefinition","paramnames":["platform"]},"vars":{"":null}},"description":"WIP Sets the platform of the object. This will be used when platforms will be fully implemented.","params":[{"type":{"names":["Drawable"]},"description":"The platform the object is attached to.","name":"platform"}],"name":"setPlatform","longname":"Paint#setPlatform","kind":"function","memberof":"Paint","scope":"instance","inherits":"Drawable#setPlatform","inherited":true,"$longname":"Paint#setPlatform"},{"comment":"/**\n     * Change the scale of the object\n     *\n     * @param {number} scale The new scale of the object.\n     *\n     * @note: it's only used when rendering, collision detection is not using the scale yet.\n     */","meta":{"range":[13819,13870],"filename":"Drawable.js","lineno":489,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002712","name":"Drawable#setScale","type":"MethodDefinition","paramnames":["scale"]},"vars":{"":null}},"description":"Change the scale of the object","params":[{"type":{"names":["number"]},"description":"The new scale of the object.","name":"scale"}],"tags":[{"originalTitle":"note:","title":"note:","text":"it's only used when rendering, collision detection is not using the scale yet.","value":"it's only used when rendering, collision detection is not using the scale yet."}],"name":"setScale","longname":"Paint#setScale","kind":"function","memberof":"Paint","scope":"instance","inherits":"Drawable#setScale","inherited":true,"$longname":"Paint#setScale"},{"comment":"/**\n     * Sets the scene of the object.\n     *\n     * @param {Scene} scene The scene of the object.\n     *\n     * @note you don't usually need to call this method as it's called when adding an object onto a scene.\n     */","meta":{"range":[5516,5665],"filename":"Drawable.js","lineno":191,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001943","name":"Drawable#setScene","type":"MethodDefinition","paramnames":["scene"]},"vars":{"":null}},"description":"Sets the scene of the object.","params":[{"type":{"names":["Scene"]},"description":"The scene of the object.","name":"scene"}],"tags":[{"originalTitle":"note","title":"note","text":"you don't usually need to call this method as it's called when adding an object onto a scene.","value":"you don't usually need to call this method as it's called when adding an object onto a scene."}],"name":"setScene","longname":"Paint#setScene","kind":"function","memberof":"Paint","scope":"instance","inherits":"Drawable#setScene","inherited":true,"$longname":"Paint#setScene"},{"comment":"/**\n     * Show the object\n     *\n     * @returns {Drawable} this\n     */","meta":{"range":[14860,14925],"filename":"Drawable.js","lineno":543,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002771","name":"Drawable#show","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Show the object","returns":[{"type":{"names":["Drawable"]},"description":"this"}],"name":"show","longname":"Paint#show","kind":"function","memberof":"Paint","scope":"instance","params":[],"inherits":"Drawable#show","inherited":true,"$longname":"Paint#show"},{"comment":"/**\n     * Draws the sprite hit box\n     *\n     * @param {RenderingContext} The canvas context where to render the hitbox.\n     */","meta":{"range":[16663,18176],"filename":"Drawable.js","lineno":617,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002857","name":"Drawable#showHitBox","type":"MethodDefinition","paramnames":["ctx"]},"vars":{"":null}},"description":"Draws the sprite hit box","params":[{"type":{"names":["RenderingContext"]},"description":"canvas context where to render the hitbox.","name":"The"}],"name":"showHitBox","longname":"Paint#showHitBox","kind":"function","memberof":"Paint","scope":"instance","inherits":"Drawable#showHitBox","inherited":true,"$longname":"Paint#showHitBox"},{"comment":"/**\n       * Draws a box around objects. This method is called when debugging is enabled.\n       *\n       * @param {RenderingContext} ctx The context where to draw the box.\n       */","meta":{"range":[18369,18743],"filename":"Drawable.js","lineno":656,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003054","name":"Drawable#showObjectBox","type":"MethodDefinition","paramnames":["ctx"]},"vars":{"":null}},"description":"Draws a box around objects. This method is called when debugging is enabled.","params":[{"type":{"names":["RenderingContext"]},"description":"The context where to draw the box.","name":"ctx"}],"name":"showObjectBox","longname":"Paint#showObjectBox","kind":"function","memberof":"Paint","scope":"instance","inherits":"Drawable#showObjectBox","inherited":true,"$longname":"Paint#showObjectBox"},{"comment":"/**\n     * Moves the object by snapping it to the map tiles\n     *\n     * @param {Boolean} isLeft Should we snap to the left?\n     * @param {Boolean} isUp Should we snap to the right?\n     */","meta":{"range":[7193,7743],"filename":"Drawable.js","lineno":248,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002106","name":"Drawable#snapToMap","type":"MethodDefinition","paramnames":["isLeft","isUp"]},"vars":{"":null}},"description":"Moves the object by snapping it to the map tiles","params":[{"type":{"names":["Boolean"]},"description":"Should we snap to the left?","name":"isLeft"},{"type":{"names":["Boolean"]},"description":"Should we snap to the right?","name":"isUp"}],"name":"snapToMap","longname":"Paint#snapToMap","kind":"function","memberof":"Paint","scope":"instance","inherits":"Drawable#snapToMap","inherited":true,"$longname":"Paint#snapToMap"},{"comment":"/**\n     * Stops current running animation\n     *\n     * In some cases, the game may need to stop effects from running before\n     * they are completed. This method proves a way to do so and set an end value.\n     *\n     * @param {any} setEndValue The end value of the animation.\n     */","meta":{"range":[23545,23877],"filename":"Drawable.js","lineno":821,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003608","name":"Drawable#stopAnimate","type":"MethodDefinition","paramnames":["setEndValue"]},"vars":{"":null}},"description":"Stops current running animation\n\nIn some cases, the game may need to stop effects from running before\nthey are completed. This method proves a way to do so and set an end value.","params":[{"type":{"names":["any"]},"description":"The end value of the animation.","name":"setEndValue"}],"name":"stopAnimate","longname":"Paint#stopAnimate","kind":"function","memberof":"Paint","scope":"instance","inherits":"Drawable#stopAnimate","inherited":true,"$longname":"Paint#stopAnimate"}],"$constructor":{"comment":"/**\n     * Creates a new Paint instance\n     *\n     * @param {String} name The name of the Paint element.\n     * @param {Object} options\n     * @param {Number} [options.width] The width of the Paint element.\n     * @param {Number} [options.height] The height of the Paint element.\n     * @param {Number} [options.x] The horizontal position of the element.\n     * @param {Number} [options.y] The vertical position of the element.\n     * @param {String} [options.color] The color of the element. Can be changed by subsequent drawing method calls.\n     *\n     */","meta":{"range":[814,1075],"filename":"Paint.js","lineno":23,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100004592","name":"Paint","type":"MethodDefinition","paramnames":["name","options"]},"vars":{"":null}},"description":"Creates a new Paint instance","params":[{"type":{"names":["String"]},"description":"The name of the Paint element.","name":"name"},{"type":{"names":["Object"]},"name":"options"},{"type":{"names":["Number"]},"optional":true,"description":"The width of the Paint element.","name":"options.width"},{"type":{"names":["Number"]},"optional":true,"description":"The height of the Paint element.","name":"options.height"},{"type":{"names":["Number"]},"optional":true,"description":"The horizontal position of the element.","name":"options.x"},{"type":{"names":["Number"]},"optional":true,"description":"The vertical position of the element.","name":"options.y"},{"type":{"names":["String"]},"optional":true,"description":"The color of the element. Can be changed by subsequent drawing method calls.","name":"options.color"}],"name":"Paint","longname":"Paint","kind":"class","scope":"global","undocumented":true,"$longname":"Paint"}},{"comment":"/**\n * Basic class for displaying text using Canvas\n *\n * @extends Drawable\n */","meta":{"range":[155,7684],"filename":"SimpleText.js","lineno":9,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100004984","name":"SimpleText","type":"ClassDeclaration","paramnames":["type","options"]}},"classdesc":"Basic class for displaying text using Canvas","augments":["Drawable"],"name":"SimpleText","longname":"SimpleText","kind":"class","scope":"global","params":[{"type":{"names":["String"]},"description":"The type of the graphic object","name":"type"},{"type":{"names":["Object"]},"optional":true,"defaultvalue":"{}","name":"options"},{"type":{"names":["String"]},"optional":true,"description":"The initial text. Can be changed later using SimpleText.setText().","name":"options.text"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"The width of the text.","name":"options.width"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"The height of the text.","name":"options.height"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"Arial\"","description":"The font to use to draw the text.","name":"options.fontFace"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"normal\"","description":"The style of the font.","name":"options.fontStyle"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"18px\"","description":"The size of the font.","name":"options.fontSize"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"normal\"","description":"The weight of the font.","name":"options.fontWeight"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"center\"","description":"How to align the text when rendered.","name":"options.align"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"white\"","description":"The color to use when rendering the text.","name":"options.color"}],"$longname":"SimpleText","$members":[{"comment":"/**\n     * Add a new Child to the object.\n     *\n     * Childs are automatically rendered and moved when the parent object is.\n     *\n     * @param {Drawable} child The child to add.\n     *\n     * @note children are automatically added to the scene/map of the parent object.\n     */","meta":{"range":[24998,25139],"filename":"Drawable.js","lineno":877,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003691","name":"Drawable#addChild","type":"MethodDefinition","paramnames":["child"]},"vars":{"":null}},"description":"Add a new Child to the object.\n\nChilds are automatically rendered and moved when the parent object is.","params":[{"type":{"names":["Drawable"]},"description":"The child to add.","name":"child"}],"tags":[{"originalTitle":"note","title":"note","text":"children are automatically added to the scene/map of the parent object.","value":"children are automatically added to the scene/map of the parent object."}],"name":"addChild","longname":"SimpleText#addChild","kind":"function","memberof":"SimpleText","scope":"instance","inherits":"Drawable#addChild","inherited":true,"$longname":"SimpleText#addChild"},{"comment":"/**\n     * Add a new handler to be called after each move of the object\n     *\n     * @param {Function} cb The callback to add.\n     */","meta":{"range":[20765,20827],"filename":"Drawable.js","lineno":731,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003406","name":"Drawable#addMoveHandler","type":"MethodDefinition","paramnames":["cb"]},"vars":{"":null}},"description":"Add a new handler to be called after each move of the object","params":[{"type":{"names":["function"]},"description":"The callback to add.","name":"cb"}],"name":"addMoveHandler","longname":"SimpleText#addMoveHandler","kind":"function","memberof":"SimpleText","scope":"instance","inherits":"Drawable#addMoveHandler","inherited":true,"$longname":"SimpleText#addMoveHandler"},{"comment":"/**\n     * Performs an animation on the object using one of the defined {FX} effects\n     *\n     * Effects change the object size/position using an interpolation function.\n     *\n     * Athena has the following effects:\n     * - {Fade} performs a fade\n     * - {Mosaic} performs a SNES-like mosaic effect\n     * - {Rotate} performs a rotation on the object\n     *\n     * @param {String} fxName The name of the effect to use.\n     * @param {Object} options The options of the effect.\n     * @param {String} [options.easing=\"linear\"] The easing functions to use, can be: 'linear', 'swing', 'easeInQuad', 'easeOutBounce'.\n     *\n     * @returns {Promise} a promise that will be fullfilled when the effect has been completed\n     */","meta":{"range":[22444,23247],"filename":"Drawable.js","lineno":787,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003490","name":"Drawable#animate","type":"MethodDefinition","paramnames":["fxName","options"]},"vars":{"":null}},"description":"Performs an animation on the object using one of the defined {FX} effects\n\nEffects change the object size/position using an interpolation function.\n\nAthena has the following effects:\n- {Fade} performs a fade\n- {Mosaic} performs a SNES-like mosaic effect\n- {Rotate} performs a rotation on the object","params":[{"type":{"names":["String"]},"description":"The name of the effect to use.","name":"fxName"},{"type":{"names":["Object"]},"description":"The options of the effect.","name":"options"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"linear\"","description":"The easing functions to use, can be: 'linear', 'swing', 'easeInQuad', 'easeOutBounce'.","name":"options.easing"}],"returns":[{"type":{"names":["Promise"]},"description":"a promise that will be fullfilled when the effect has been completed"}],"name":"animate","longname":"SimpleText#animate","kind":"function","memberof":"SimpleText","scope":"instance","inherits":"Drawable#animate","inherited":true,"$longname":"SimpleText#animate"},{"comment":"/**\n     * Stops the object from moving, optionnaly immediately going to target position\n     *\n     * @param {Boolean} [gotoTarget=false] Set to true to go to the target position.\n     */","meta":{"range":[8766,8998],"filename":"Drawable.js","lineno":305,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002243","name":"Drawable#cancelMoveTo","type":"MethodDefinition","paramnames":["gotoTarget"]},"vars":{"":null}},"description":"Stops the object from moving, optionnaly immediately going to target position","params":[{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"Set to true to go to the target position.","name":"gotoTarget"}],"name":"cancelMoveTo","longname":"SimpleText#cancelMoveTo","kind":"function","memberof":"SimpleText","scope":"instance","inherits":"Drawable#cancelMoveTo","inherited":true,"$longname":"SimpleText#cancelMoveTo"},{"comment":"/**\n     * Centers the object into the scene.\n     *\n     * @returns {Drawable} this\n     */","meta":{"range":[9101,9292],"filename":"Drawable.js","lineno":320,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002280","name":"Drawable#center","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Centers the object into the scene.","returns":[{"type":{"names":["Drawable"]},"description":"this"}],"name":"center","longname":"SimpleText#center","kind":"function","memberof":"SimpleText","scope":"instance","params":[],"inherits":"Drawable#center","inherited":true,"$longname":"SimpleText#center"},{"comment":"/**\n     * Stop using a particular behavior.\n     *\n     * The vx and vy properties of the object will be set to zero.\n     */","meta":{"range":[10033,10117],"filename":"Drawable.js","lineno":349,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002359","name":"Drawable#clearBehavior","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Stop using a particular behavior.\n\nThe vx and vy properties of the object will be set to zero.","name":"clearBehavior","longname":"SimpleText#clearBehavior","kind":"function","memberof":"SimpleText","scope":"instance","params":[],"inherits":"Drawable#clearBehavior","inherited":true,"$longname":"SimpleText#clearBehavior"},{"comment":"/**\n     * Clears the buffer\n     */","meta":{"range":[2411,2492],"filename":"SimpleText.js","lineno":71,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100005136","name":"SimpleText#clearBuffer","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Clears the buffer","name":"clearBuffer","longname":"SimpleText#clearBuffer","kind":"function","memberof":"SimpleText","scope":"instance","params":[],"$longname":"SimpleText#clearBuffer"},{"comment":"/**\n     * Generates a new buffer that can hold current text\n     *\n     * @param {Display} display The display to get the buffer from.\n     */","meta":{"range":[2045,2364],"filename":"SimpleText.js","lineno":59,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100005105","name":"SimpleText#createBuffer","type":"MethodDefinition","paramnames":["display"]},"vars":{"":null}},"description":"Generates a new buffer that can hold current text","params":[{"type":{"names":["Display"]},"description":"The display to get the buffer from.","name":"display"}],"name":"createBuffer","longname":"SimpleText#createBuffer","kind":"function","memberof":"SimpleText","scope":"instance","$longname":"SimpleText#createBuffer"},{"comment":"/**\n     * Destroy is called when an object is removed from a scene or object\n     *\n     * @note calling destroy on a parent will automatically call the destroy method of each child.\n     */","meta":{"range":[28118,28636],"filename":"Drawable.js","lineno":984,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003963","name":"Drawable#destroy","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Destroy is called when an object is removed from a scene or object","tags":[{"originalTitle":"note","title":"note","text":"calling destroy on a parent will automatically call the destroy method of each child.","value":"calling destroy on a parent will automatically call the destroy method of each child."}],"name":"destroy","longname":"SimpleText#destroy","kind":"function","memberof":"SimpleText","scope":"instance","params":[],"inherits":"Drawable#destroy","inherited":true,"$longname":"SimpleText#destroy"},{"comment":"/**\n     * Returns the angle property of the object.\n     * \n     * @returns {Number} The angle of the object\n     */","meta":{"range":[14335,14380],"filename":"Drawable.js","lineno":510,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002734","name":"Drawable#getAngle","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the angle property of the object.","returns":[{"type":{"names":["Number"]},"description":"The angle of the object"}],"name":"getAngle","longname":"SimpleText#getAngle","kind":"function","memberof":"SimpleText","scope":"instance","params":[],"inherits":"Drawable#getAngle","inherited":true,"$longname":"SimpleText#getAngle"},{"comment":"/**\n     * Returns the height of the text object\n     *\n     * @returns {Number} The object's height\n     */","meta":{"range":[5625,5683],"filename":"SimpleText.js","lineno":211,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100005449","name":"SimpleText#getCurrentHeight","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the height of the text object","returns":[{"type":{"names":["Number"]},"description":"The object's height"}],"name":"getCurrentHeight","longname":"SimpleText#getCurrentHeight","kind":"function","memberof":"SimpleText","scope":"instance","params":[],"overrides":"Drawable#getCurrentHeight","$longname":"SimpleText#getCurrentHeight"},{"comment":"/**\n     * Returns the horizontal offset of the text object\n     *\n     * @returns {Number} The object's horizontal offset\n     */","meta":{"range":[5824,5880],"filename":"SimpleText.js","lineno":220,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100005457","name":"SimpleText#getCurrentOffsetX","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the horizontal offset of the text object","returns":[{"type":{"names":["Number"]},"description":"The object's horizontal offset"}],"name":"getCurrentOffsetX","longname":"SimpleText#getCurrentOffsetX","kind":"function","memberof":"SimpleText","scope":"instance","params":[],"$longname":"SimpleText#getCurrentOffsetX"},{"comment":"/**\n     * Returns the vertical offset of the text object\n     *\n     * @returns {Number} The object's vertical offset\n     */","meta":{"range":[6017,6073],"filename":"SimpleText.js","lineno":229,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100005465","name":"SimpleText#getCurrentOffsetY","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the vertical offset of the text object","returns":[{"type":{"names":["Number"]},"description":"The object's vertical offset"}],"name":"getCurrentOffsetY","longname":"SimpleText#getCurrentOffsetY","kind":"function","memberof":"SimpleText","scope":"instance","params":[],"$longname":"SimpleText#getCurrentOffsetY"},{"comment":"/**\n     * Returns the width of the text object\n     *\n     * @returns {Number} The object's width\n     */","meta":{"range":[5450,5506],"filename":"SimpleText.js","lineno":202,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100005441","name":"SimpleText#getCurrentWidth","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the width of the text object","returns":[{"type":{"names":["Number"]},"description":"The object's width"}],"name":"getCurrentWidth","longname":"SimpleText#getCurrentWidth","kind":"function","memberof":"SimpleText","scope":"instance","params":[],"overrides":"Drawable#getCurrentWidth","$longname":"SimpleText#getCurrentWidth"},{"comment":"/**\n     * Returns the hitbox of the text object\n     *\n     * @returns {Object} The new hitbox\n     */","meta":{"range":[5203,5333],"filename":"SimpleText.js","lineno":188,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100005423","name":"SimpleText#getHitBox","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the hitbox of the text object","returns":[{"type":{"names":["Object"]},"description":"The new hitbox"}],"name":"getHitBox","longname":"SimpleText#getHitBox","kind":"function","memberof":"SimpleText","scope":"instance","params":[],"overrides":"Drawable#getHitBox","$longname":"SimpleText#getHitBox"},{"comment":"/**\n     * Gets the following text metrics:\n     *  - this.fakeLineHeight`\n     * - `this.fakeHeight`\n     * - `this.fakeWidth`\n     *\n     * This method also sets the canvas'width & height to fit these metrics\n     */","meta":{"range":[3521,4119],"filename":"SimpleText.js","lineno":124,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100005232","name":"SimpleText#getMetrics","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Gets the following text metrics:\n - this.fakeLineHeight`\n- `this.fakeHeight`\n- `this.fakeWidth`\n\nThis method also sets the canvas'width & height to fit these metrics","name":"getMetrics","longname":"SimpleText#getMetrics","kind":"function","memberof":"SimpleText","scope":"instance","params":[],"$longname":"SimpleText#getMetrics"},{"comment":"/**\n     * Returns the current opacity of the object\n     *\n     * @returns {number} The current opacity value.\n     */","meta":{"range":[8518,8567],"filename":"Drawable.js","lineno":296,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002235","name":"Drawable#getOpacity","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the current opacity of the object","returns":[{"type":{"names":["number"]},"description":"The current opacity value."}],"name":"getOpacity","longname":"SimpleText#getOpacity","kind":"function","memberof":"SimpleText","scope":"instance","params":[],"inherits":"Drawable#getOpacity","inherited":true,"$longname":"SimpleText#getOpacity"},{"comment":"/**\n     * Returns previously seved position\n     *\n     * @returns {Object} The saved position\n     */","meta":{"range":[13162,13271],"filename":"Drawable.js","lineno":455,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002683","name":"Drawable#getSavedPosition","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns previously seved position","returns":[{"type":{"names":["Object"]},"description":"The saved position"}],"name":"getSavedPosition","longname":"SimpleText#getSavedPosition","kind":"function","memberof":"SimpleText","scope":"instance","params":[],"inherits":"Drawable#getSavedPosition","inherited":true,"$longname":"SimpleText#getSavedPosition"},{"comment":"/**\n     * Hides the object\n     *\n     * @returns {Drawable} this\n     */","meta":{"range":[14710,14776],"filename":"Drawable.js","lineno":532,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002759","name":"Drawable#hide","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Hides the object","returns":[{"type":{"names":["Drawable"]},"description":"this"}],"name":"hide","longname":"SimpleText#hide","kind":"function","memberof":"SimpleText","scope":"instance","params":[],"inherits":"Drawable#hide","inherited":true,"$longname":"SimpleText#hide"},{"comment":"/**\n     * Performs collision tests on the specifed object.\n     *\n     * @param {Drawable} obj The object to perform test on\n     *\n     * @returns {Boolean} Returns true if this and obj collide\n     */","meta":{"range":[19080,20353],"filename":"Drawable.js","lineno":678,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003151","name":"Drawable#hitTest","type":"MethodDefinition","paramnames":["obj"]},"vars":{"":null}},"description":"Performs collision tests on the specifed object.","params":[{"type":{"names":["Drawable"]},"description":"The object to perform test on","name":"obj"}],"returns":[{"type":{"names":["Boolean"]},"description":"Returns true if this and obj collide"}],"name":"hitTest","longname":"SimpleText#hitTest","kind":"function","memberof":"SimpleText","scope":"instance","inherits":"Drawable#hitTest","inherited":true,"$longname":"SimpleText#hitTest"},{"comment":"/**\n     * Moves the object to a new destination.\n     *\n     * @param {number} x The new horizontal position.\n     * @param {number} y The new vertical position.\n     * @param {number} [duration=0] The duration of the move, 0 to have the object move immediately to new position.\n     *\n     * @returns {Drawable} this\n     */","meta":{"range":[6272,6991],"filename":"Drawable.js","lineno":217,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001981","name":"Drawable#moveTo","type":"MethodDefinition","paramnames":["x","y","duration"]},"vars":{"":null}},"description":"Moves the object to a new destination.","params":[{"type":{"names":["number"]},"description":"The new horizontal position.","name":"x"},{"type":{"names":["number"]},"description":"The new vertical position.","name":"y"},{"type":{"names":["number"]},"optional":true,"defaultvalue":0,"description":"The duration of the move, 0 to have the object move immediately to new position.","name":"duration"}],"returns":[{"type":{"names":["Drawable"]},"description":"this"}],"name":"moveTo","longname":"SimpleText#moveTo","kind":"function","memberof":"SimpleText","scope":"instance","inherits":"Drawable#moveTo","inherited":true,"$longname":"SimpleText#moveTo"},{"comment":"/**\n     * Sends a notification to listeners\n     *\n     * @note: this is a simple wrapper to the NotificationManageger's notify method\n     *\n     * @param {String} id name of the event to send\n     * @param {Object} data data to send with the event, default = empty object\n     */","meta":{"range":[27760,27836],"filename":"Drawable.js","lineno":973,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003941","name":"Drawable#notify","type":"MethodDefinition","paramnames":["id","data"]},"vars":{"":null}},"description":"Sends a notification to listeners","tags":[{"originalTitle":"note:","title":"note:","text":"this is a simple wrapper to the NotificationManageger's notify method","value":"this is a simple wrapper to the NotificationManageger's notify method"}],"params":[{"type":{"names":["String"]},"description":"name of the event to send","name":"id"},{"type":{"names":["Object"]},"description":"data to send with the event, default = empty object","name":"data"}],"name":"notify","longname":"SimpleText#notify","kind":"function","memberof":"SimpleText","scope":"instance","inherits":"Drawable#notify","inherited":true,"$longname":"SimpleText#notify"},{"comment":"/**\n     * onCollision is called on each collision with the object.\n     *\n     * This method does nothing and should be extended if needed.\n     *\n     */","meta":{"range":[24683,24705],"filename":"Drawable.js","lineno":864,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003687","name":"Drawable#onCollision","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"onCollision is called on each collision with the object.\n\nThis method does nothing and should be extended if needed.","name":"onCollision","longname":"SimpleText#onCollision","kind":"function","memberof":"SimpleText","scope":"instance","params":[],"inherits":"Drawable#onCollision","inherited":true,"$longname":"SimpleText#onCollision"},{"comment":"/**\n     * Called when an object collides with the text Object\n     *\n     * @param {Drawable} obj The graphical object that collided.\n     */","meta":{"range":[6226,6376],"filename":"SimpleText.js","lineno":238,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100005473","name":"SimpleText#onHit","type":"MethodDefinition","paramnames":["obj"]},"vars":{"":null}},"description":"Called when an object collides with the text Object","params":[{"type":{"names":["Drawable"]},"description":"The graphical object that collided.","name":"obj"}],"name":"onHit","longname":"SimpleText#onHit","kind":"function","memberof":"SimpleText","scope":"instance","overrides":"Drawable#onHit","$longname":"SimpleText#onHit"},{"comment":"/**\n     * Plays the spcified sound\n     *\n     * @param {String} id The id of the sound to play.\n     * @param {Object} options\n     * @param {Boolean} [options.pan=true] Set pan to true if you want to use panning.\n     * @param {Boolean} [options.loop=false] Set to true to loop the sound.\n     */","meta":{"range":[26781,27467],"filename":"Drawable.js","lineno":943,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003823","name":"Drawable#playSound","type":"MethodDefinition","paramnames":["id","options"]},"vars":{"":null}},"description":"Plays the spcified sound","params":[{"type":{"names":["String"]},"description":"The id of the sound to play.","name":"id"},{"type":{"names":["Object"]},"name":"options"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":true,"description":"Set pan to true if you want to use panning.","name":"options.pan"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"Set to true to loop the sound.","name":"options.loop"}],"name":"playSound","longname":"SimpleText#playSound","kind":"function","memberof":"SimpleText","scope":"instance","inherits":"Drawable#playSound","inherited":true,"$longname":"SimpleText#playSound"},{"comment":"/**\n     * Prepare render by getting text metrics and creating temp text buffer\n     */","meta":{"range":[3026,3292],"filename":"SimpleText.js","lineno":103,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100005184","name":"SimpleText#prepareRender","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Prepare render by getting text metrics and creating temp text buffer","name":"prepareRender","longname":"SimpleText#prepareRender","kind":"function","memberof":"SimpleText","scope":"instance","params":[],"$longname":"SimpleText#prepareRender"},{"comment":"/**\n     * Remove every children from the object.\n     */","meta":{"range":[25612,25780],"filename":"Drawable.js","lineno":903,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003759","name":"Drawable#removeAllChildren","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Remove every children from the object.","name":"removeAllChildren","longname":"SimpleText#removeAllChildren","kind":"function","memberof":"SimpleText","scope":"instance","params":[],"inherits":"Drawable#removeAllChildren","inherited":true,"$longname":"SimpleText#removeAllChildren"},{"comment":"/**\n     * Remove a child from the object\n     *\n     * @param {Drawable} child The child to remove from the object.\n     *\n     * @note: removing a child object will call its `destroy` method.\n     */","meta":{"range":[25351,25544],"filename":"Drawable.js","lineno":891,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003720","name":"Drawable#removeChild","type":"MethodDefinition","paramnames":["child"]},"vars":{"":null}},"description":"Remove a child from the object","params":[{"type":{"names":["Drawable"]},"description":"The child to remove from the object.","name":"child"}],"tags":[{"originalTitle":"note:","title":"note:","text":"removing a child object will call its `destroy` method.","value":"removing a child object will call its `destroy` method."}],"name":"removeChild","longname":"SimpleText#removeChild","kind":"function","memberof":"SimpleText","scope":"instance","inherits":"Drawable#removeChild","inherited":true,"$longname":"SimpleText#removeChild"},{"comment":"/**\n     * pre-renders text in a temp canvas\n     */","meta":{"range":[4182,4373],"filename":"SimpleText.js","lineno":144,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100005330","name":"SimpleText#renderText","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"pre-renders text in a temp canvas","name":"renderText","longname":"SimpleText#renderText","kind":"function","memberof":"SimpleText","scope":"instance","params":[],"$longname":"SimpleText#renderText"},{"comment":"/**\n     * User customized reset method\n     */","meta":{"range":[3584,3600],"filename":"Drawable.js","lineno":119,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001682","name":"Drawable#reset","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"User customized reset method","name":"reset","longname":"SimpleText#reset","kind":"function","memberof":"SimpleText","scope":"instance","params":[],"inherits":"Drawable#reset","inherited":true,"$longname":"SimpleText#reset"},{"comment":"/**\n     * Restores the previous context globalAlpha property.\n     *\n     * @param {RenderingContext} ctx The context.\n     */","meta":{"range":[15480,15550],"filename":"Drawable.js","lineno":568,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002804","name":"Drawable#restoreCtxAlpha","type":"MethodDefinition","paramnames":["ctx"]},"vars":{"":null}},"description":"Restores the previous context globalAlpha property.","params":[{"type":{"names":["RenderingContext"]},"description":"The context.","name":"ctx"}],"name":"restoreCtxAlpha","longname":"SimpleText#restoreCtxAlpha","kind":"function","memberof":"SimpleText","scope":"instance","inherits":"Drawable#restoreCtxAlpha","inherited":true,"$longname":"SimpleText#restoreCtxAlpha"},{"comment":"/**\n     * Saves current object position into `savedX` and `savedY` properties\n     */","meta":{"range":[12966,13048],"filename":"Drawable.js","lineno":445,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002663","name":"Drawable#savePosition","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Saves current object position into `savedX` and `savedY` properties","name":"savePosition","longname":"SimpleText#savePosition","kind":"function","memberof":"SimpleText","scope":"instance","params":[],"inherits":"Drawable#savePosition","inherited":true,"$longname":"SimpleText#savePosition"},{"comment":"/**\n     * Change the angle of an object\n     *\n     * @param {number} angle The new angle of the object. 0 < angle < 360.\n     *\n     * @note This property is only used for the rendering and it's ignored for collisions.\n     */","meta":{"range":[14109,14207],"filename":"Drawable.js","lineno":500,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002723","name":"Drawable#setAngle","type":"MethodDefinition","paramnames":["angle"]},"vars":{"":null}},"description":"Change the angle of an object","params":[{"type":{"names":["number"]},"description":"The new angle of the object. 0 < angle < 360.","name":"angle"}],"tags":[{"originalTitle":"note","title":"note","text":"This property is only used for the rendering and it's ignored for collisions.","value":"This property is only used for the rendering and it's ignored for collisions."}],"name":"setAngle","longname":"SimpleText#setAngle","kind":"function","memberof":"SimpleText","scope":"instance","inherits":"Drawable#setAngle","inherited":true,"$longname":"SimpleText#setAngle"},{"comment":"/**\n     * Sets a new behavior to the object: this will be called in the move loop\n     *\n     * @param {(String|Behavior)} behavior Either the name of a standard behavior or a Behavior class to use.\n     * @param {Object} [options={}] The options of the behavior (may depend on the behavior type).\n     *\n     * @related {Behavior}\n     */","meta":{"range":[9643,9896],"filename":"Drawable.js","lineno":336,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002322","name":"Drawable#setBehavior","type":"MethodDefinition","paramnames":["behavior","options"]},"vars":{"":null}},"description":"Sets a new behavior to the object: this will be called in the move loop","params":[{"type":{"names":["String","Behavior"]},"description":"Either the name of a standard behavior or a Behavior class to use.","name":"behavior"},{"type":{"names":["Object"]},"optional":true,"defaultvalue":"{}","description":"The options of the behavior (may depend on the behavior type).","name":"options"}],"tags":[{"originalTitle":"related","title":"related","text":"{Behavior}","value":"{Behavior}"}],"name":"setBehavior","longname":"SimpleText#setBehavior","kind":"function","memberof":"SimpleText","scope":"instance","inherits":"Drawable#setBehavior","inherited":true,"$longname":"SimpleText#setBehavior"},{"comment":"/**\n     * Change the color of the object\n     *\n     * @param {String} color The new color to use, can be anything that is valid for the `color` *CSS* property.\n     */","meta":{"range":[5011,5089],"filename":"SimpleText.js","lineno":178,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100005407","name":"SimpleText#setColor","type":"MethodDefinition","paramnames":["color"]},"vars":{"":null}},"description":"Change the color of the object","params":[{"type":{"names":["String"]},"description":"The new color to use, can be anything that is valid for the `color` *CSS* property.","name":"color"}],"name":"setColor","longname":"SimpleText#setColor","kind":"function","memberof":"SimpleText","scope":"instance","$longname":"SimpleText#setColor"},{"comment":"/**\n     * Associates an image to the drawable.\n     *\n     * Some objects (eg. Sprite) need a source sheet image before being able to\n     * be rendered onto the display.\n     *\n     * @param {Image} image the image that this object needs to draw: redefine if needed\n     */","meta":{"range":[26066,26090],"filename":"Drawable.js","lineno":918,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003795","name":"Drawable#setImage","type":"MethodDefinition","paramnames":["image"]},"vars":{"":null}},"description":"Associates an image to the drawable.\n\nSome objects (eg. Sprite) need a source sheet image before being able to\nbe rendered onto the display.","params":[{"type":{"names":["Image"]},"description":"the image that this object needs to draw: redefine if needed","name":"image"}],"name":"setImage","longname":"SimpleText#setImage","kind":"function","memberof":"SimpleText","scope":"instance","inherits":"Drawable#setImage","inherited":true,"$longname":"SimpleText#setImage"},{"comment":"/**\n     * Sets the map of the object.\n     *\n     * @param {Map} map The map of the object.\n     *\n     * @note you don't usually need to call this method as it's called automatically when adding an object\n     * onto a map.\n     *\n     */","meta":{"range":[5146,5283],"filename":"Drawable.js","lineno":176,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001916","name":"Drawable#setMap","type":"MethodDefinition","paramnames":["map"]},"vars":{"":null}},"description":"Sets the map of the object.","params":[{"type":{"names":["Map"]},"description":"The map of the object.","name":"map"}],"tags":[{"originalTitle":"note","title":"note","text":"you don't usually need to call this method as it's called automatically when adding an object\nonto a map.","value":"you don't usually need to call this method as it's called automatically when adding an object\nonto a map."}],"name":"setMap","longname":"SimpleText#setMap","kind":"function","memberof":"SimpleText","scope":"instance","inherits":"Drawable#setMap","inherited":true,"$longname":"SimpleText#setMap"},{"comment":"/**\n     * Applies a new mask to the object, clipping its drawing onto the scene/map\n     *\n     * @param {Object} mask The new mask to use, set to null to remove the mask.\n     * @param {Boolean} exclude Set to true to have the mask exclude portions of the drawing, in this case mask.color will be used.\n     */","meta":{"range":[8066,8211],"filename":"Drawable.js","lineno":275,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002197","name":"Drawable#setMask","type":"MethodDefinition","paramnames":["mask","exclude"]},"vars":{"":null}},"description":"Applies a new mask to the object, clipping its drawing onto the scene/map","params":[{"type":{"names":["Object"]},"description":"The new mask to use, set to null to remove the mask.","name":"mask","defaultvalue":null},{"type":{"names":["Boolean"]},"description":"Set to true to have the mask exclude portions of the drawing, in this case mask.color will be used.","name":"exclude","defaultvalue":false}],"name":"setMask","longname":"SimpleText#setMask","kind":"function","memberof":"SimpleText","scope":"instance","inherits":"Drawable#setMask","inherited":true,"$longname":"SimpleText#setMask"},{"comment":"/**\n     * Changes the opacity of the object\n     *\n     * @param {number} opacity The new opacity.\n     */","meta":{"range":[8329,8388],"filename":"Drawable.js","lineno":287,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002224","name":"Drawable#setOpacity","type":"MethodDefinition","paramnames":["opacity"]},"vars":{"":null}},"description":"Changes the opacity of the object","params":[{"type":{"names":["number"]},"description":"The new opacity.","name":"opacity"}],"name":"setOpacity","longname":"SimpleText#setOpacity","kind":"function","memberof":"SimpleText","scope":"instance","inherits":"Drawable#setOpacity","inherited":true,"$longname":"SimpleText#setOpacity"},{"comment":"/**\n     * Sets a new path for the object\n     *\n     * @param {Path} path The new path that the object will use when moving.\n     *\n     * @related {Path}\n     */","meta":{"range":[13547,13594],"filename":"Drawable.js","lineno":478,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002701","name":"Drawable#setPath","type":"MethodDefinition","paramnames":["path"]},"vars":{"":null}},"description":"Sets a new path for the object","params":[{"type":{"names":["Path"]},"description":"The new path that the object will use when moving.","name":"path"}],"tags":[{"originalTitle":"related","title":"related","text":"{Path}","value":"{Path}"}],"name":"setPath","longname":"SimpleText#setPath","kind":"function","memberof":"SimpleText","scope":"instance","inherits":"Drawable#setPath","inherited":true,"$longname":"SimpleText#setPath"},{"comment":"/**\n     * WIP Sets the platform of the object. This will be used when platforms will be fully implemented.\n     *\n     * @param {Drawable} platform The platform the object is attached to.\n     */","meta":{"range":[5872,5935],"filename":"Drawable.js","lineno":204,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001970","name":"Drawable#setPlatform","type":"MethodDefinition","paramnames":["platform"]},"vars":{"":null}},"description":"WIP Sets the platform of the object. This will be used when platforms will be fully implemented.","params":[{"type":{"names":["Drawable"]},"description":"The platform the object is attached to.","name":"platform"}],"name":"setPlatform","longname":"SimpleText#setPlatform","kind":"function","memberof":"SimpleText","scope":"instance","inherits":"Drawable#setPlatform","inherited":true,"$longname":"SimpleText#setPlatform"},{"comment":"/**\n     * Change the scale of the object\n     *\n     * @param {number} scale The new scale of the object.\n     *\n     * @note: it's only used when rendering, collision detection is not using the scale yet.\n     */","meta":{"range":[13819,13870],"filename":"Drawable.js","lineno":489,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002712","name":"Drawable#setScale","type":"MethodDefinition","paramnames":["scale"]},"vars":{"":null}},"description":"Change the scale of the object","params":[{"type":{"names":["number"]},"description":"The new scale of the object.","name":"scale"}],"tags":[{"originalTitle":"note:","title":"note:","text":"it's only used when rendering, collision detection is not using the scale yet.","value":"it's only used when rendering, collision detection is not using the scale yet."}],"name":"setScale","longname":"SimpleText#setScale","kind":"function","memberof":"SimpleText","scope":"instance","inherits":"Drawable#setScale","inherited":true,"$longname":"SimpleText#setScale"},{"comment":"/**\n     * Overrides Drawable's setScene element: we need to have\n     * have a scene to be able to calculate metrics\n     *\n     * @param {*} scene\n     */","meta":{"range":[4743,4831],"filename":"SimpleText.js","lineno":167,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100005388","name":"SimpleText#setScene","type":"MethodDefinition","paramnames":["scene"]},"vars":{"":null}},"description":"Overrides Drawable's setScene element: we need to have\nhave a scene to be able to calculate metrics","params":[{"type":{"names":["*"]},"name":"scene"}],"name":"setScene","longname":"SimpleText#setScene","kind":"function","memberof":"SimpleText","scope":"instance","overrides":"Drawable#setScene","$longname":"SimpleText#setScene"},{"comment":"/**\n     * Change the size of the object\n     *\n     * @param {Number} width The width of the object.\n     * @param {Number} height The height of the object.\n     */","meta":{"range":[2750,2928],"filename":"SimpleText.js","lineno":90,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100005156","name":"SimpleText#setSize","type":"MethodDefinition","paramnames":["width","height"]},"vars":{"":null}},"description":"Change the size of the object","params":[{"type":{"names":["Number"]},"description":"The width of the object.","name":"width"},{"type":{"names":["Number"]},"description":"The height of the object.","name":"height"}],"name":"setSize","longname":"SimpleText#setSize","kind":"function","memberof":"SimpleText","scope":"instance","$longname":"SimpleText#setSize"},{"comment":"/**\n     * Updates the text's object\n     *\n     * @param {String} text The new text of the SimpleText object.\n     */","meta":{"range":[4502,4576],"filename":"SimpleText.js","lineno":156,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100005372","name":"SimpleText#setText","type":"MethodDefinition","paramnames":["text"]},"vars":{"":null}},"description":"Updates the text's object","params":[{"type":{"names":["String"]},"description":"The new text of the SimpleText object.","name":"text"}],"name":"setText","longname":"SimpleText#setText","kind":"function","memberof":"SimpleText","scope":"instance","$longname":"SimpleText#setText"},{"comment":"/**\n     * Show the object\n     *\n     * @returns {Drawable} this\n     */","meta":{"range":[14860,14925],"filename":"Drawable.js","lineno":543,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002771","name":"Drawable#show","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Show the object","returns":[{"type":{"names":["Drawable"]},"description":"this"}],"name":"show","longname":"SimpleText#show","kind":"function","memberof":"SimpleText","scope":"instance","params":[],"inherits":"Drawable#show","inherited":true,"$longname":"SimpleText#show"},{"comment":"/**\n     * Draws the sprite hit box\n     *\n     * @param {RenderingContext} The canvas context where to render the hitbox.\n     */","meta":{"range":[16663,18176],"filename":"Drawable.js","lineno":617,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002857","name":"Drawable#showHitBox","type":"MethodDefinition","paramnames":["ctx"]},"vars":{"":null}},"description":"Draws the sprite hit box","params":[{"type":{"names":["RenderingContext"]},"description":"canvas context where to render the hitbox.","name":"The"}],"name":"showHitBox","longname":"SimpleText#showHitBox","kind":"function","memberof":"SimpleText","scope":"instance","inherits":"Drawable#showHitBox","inherited":true,"$longname":"SimpleText#showHitBox"},{"comment":"/**\n       * Draws a box around objects. This method is called when debugging is enabled.\n       *\n       * @param {RenderingContext} ctx The context where to draw the box.\n       */","meta":{"range":[18369,18743],"filename":"Drawable.js","lineno":656,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003054","name":"Drawable#showObjectBox","type":"MethodDefinition","paramnames":["ctx"]},"vars":{"":null}},"description":"Draws a box around objects. This method is called when debugging is enabled.","params":[{"type":{"names":["RenderingContext"]},"description":"The context where to draw the box.","name":"ctx"}],"name":"showObjectBox","longname":"SimpleText#showObjectBox","kind":"function","memberof":"SimpleText","scope":"instance","inherits":"Drawable#showObjectBox","inherited":true,"$longname":"SimpleText#showObjectBox"},{"comment":"/**\n     * Moves the object by snapping it to the map tiles\n     *\n     * @param {Boolean} isLeft Should we snap to the left?\n     * @param {Boolean} isUp Should we snap to the right?\n     */","meta":{"range":[7193,7743],"filename":"Drawable.js","lineno":248,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002106","name":"Drawable#snapToMap","type":"MethodDefinition","paramnames":["isLeft","isUp"]},"vars":{"":null}},"description":"Moves the object by snapping it to the map tiles","params":[{"type":{"names":["Boolean"]},"description":"Should we snap to the left?","name":"isLeft"},{"type":{"names":["Boolean"]},"description":"Should we snap to the right?","name":"isUp"}],"name":"snapToMap","longname":"SimpleText#snapToMap","kind":"function","memberof":"SimpleText","scope":"instance","inherits":"Drawable#snapToMap","inherited":true,"$longname":"SimpleText#snapToMap"},{"comment":"/**\n     * Stops current running animation\n     *\n     * In some cases, the game may need to stop effects from running before\n     * they are completed. This method proves a way to do so and set an end value.\n     *\n     * @param {any} setEndValue The end value of the animation.\n     */","meta":{"range":[23545,23877],"filename":"Drawable.js","lineno":821,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003608","name":"Drawable#stopAnimate","type":"MethodDefinition","paramnames":["setEndValue"]},"vars":{"":null}},"description":"Stops current running animation\n\nIn some cases, the game may need to stop effects from running before\nthey are completed. This method proves a way to do so and set an end value.","params":[{"type":{"names":["any"]},"description":"The end value of the animation.","name":"setEndValue"}],"name":"stopAnimate","longname":"SimpleText#stopAnimate","kind":"function","memberof":"SimpleText","scope":"instance","inherits":"Drawable#stopAnimate","inherited":true,"$longname":"SimpleText#stopAnimate"}],"$constructor":{"comment":"/**\n     *\n     * @param {String} type The type of the graphic object\n     * @param {Object} [options={}]\n     * @param {String} [options.text=undefined] The initial text. Can be changed later using SimpleText.setText().\n     * @param {Number} [options.width=0] The width of the text.\n     * @param {Number} [options.height=0] The height of the text.\n     * @param {String} [options.fontFace=\"Arial\"] The font to use to draw the text.\n     * @param {String} [options.fontStyle=\"normal\"] The style of the font.\n     * @param {String} [options.fontSize=\"18px\"] The size of the font.\n     * @param {String} [options.fontWeight=\"normal\"] The weight of the font.\n     * @param {String} [options.align=\"center\"] How to align the text when rendered.\n     * @param {String} [options.color=\"white\"] The color to use when rendering the text.\n     *\n     * @example\n     *\n     * let myText = new SimpleText({\n     *  text: 'hello',\n     *  fontFace: 'Verdana',\n     *  fontStyle: 'bold',\n     *  fontSize: '24px'\n     * })\n     */","meta":{"range":[1220,1891],"filename":"SimpleText.js","lineno":33,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100004988","name":"SimpleText","type":"MethodDefinition","paramnames":["type","options"]},"vars":{"":null}},"params":[{"type":{"names":["String"]},"description":"The type of the graphic object","name":"type"},{"type":{"names":["Object"]},"optional":true,"defaultvalue":"{}","name":"options"},{"type":{"names":["String"]},"optional":true,"description":"The initial text. Can be changed later using SimpleText.setText().","name":"options.text"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"The width of the text.","name":"options.width"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"The height of the text.","name":"options.height"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"Arial\"","description":"The font to use to draw the text.","name":"options.fontFace"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"normal\"","description":"The style of the font.","name":"options.fontStyle"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"18px\"","description":"The size of the font.","name":"options.fontSize"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"normal\"","description":"The weight of the font.","name":"options.fontWeight"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"center\"","description":"How to align the text when rendered.","name":"options.align"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"white\"","description":"The color to use when rendering the text.","name":"options.color"}],"examples":["let myText = new SimpleText({\n text: 'hello',\n fontFace: 'Verdana',\n fontStyle: 'bold',\n fontSize: '24px'\n})"],"name":"SimpleText","longname":"SimpleText","kind":"class","scope":"global","undocumented":true,"$longname":"SimpleText"}},{"comment":"/**\n * This class extends {Drawable} to implement 2D sprites using an image sprite sheet.\n *\n * A sprite can have an infinite number of animations.\n * Each animation can have a different frameDuration and any number of frames.\n * Each frame may have a different size and a different hitbox\n *\n * @note Since games usually have multiple sprites of the same type, it's common to extend the Sprite class\n * to generate each sprite type with its own properties and then use these sprites instead of instanciating\n * the Sprite class.\n *\n *\n * @extends Drawable\n */","meta":{"range":[708,26744],"filename":"Sprite.js","lineno":20,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100005717","name":"Sprite","type":"ClassDeclaration","paramnames":["type","options"]}},"classdesc":"This class extends {Drawable} to implement 2D sprites using an image sprite sheet.\n\nA sprite can have an infinite number of animations.\nEach animation can have a different frameDuration and any number of frames.\nEach frame may have a different size and a different hitbox","tags":[{"originalTitle":"note","title":"note","text":"Since games usually have multiple sprites of the same type, it's common to extend the Sprite class\nto generate each sprite type with its own properties and then use these sprites instead of instanciating\nthe Sprite class.","value":"Since games usually have multiple sprites of the same type, it's common to extend the Sprite class\nto generate each sprite type with its own properties and then use these sprites instead of instanciating\nthe Sprite class."}],"augments":["Drawable"],"name":"Sprite","longname":"Sprite","kind":"class","scope":"global","description":"Creates a new Sprite","params":[{"type":{"names":["String"]},"description":"An identifier for this sprite, can be for example `enemy1`,...","name":"type"},{"type":{"names":["Object"]},"description":"An options hash for the object.","name":"options"},{"type":{"names":["String"]},"description":"The id to the spritesheet image to use.","name":"options.imageId"},{"type":{"names":["Object"]},"description":"A map with a key for each animation of the sprite.","name":"options.animations"}],"$longname":"Sprite","$members":[{"comment":"/**\n     * Adds a new animation to the sprite\n     *\n     * @param {String} name The name of the new animation.\n     * @param {String} id The id of the resource (image) to use for the animation.\n     * @param {Object} [options={}] The animation to add, see:\n     * @param {number} [options.offsetX=0] The x offset of the sprite frames inside the image.\n     * @param {number} [options.offsetY=0] The y offset of the sprite frames inside the image.\n     * @param {number} [options.frameWidth] The width of a frame.\n     * @param {number} [options.frameHeight=imageHeight] The height of a frame. By default frameHeight is taken from image.naturalHeight.\n     * @param {number} [options.frameDuration=1] The duration of a frame (1 = 16ms).\n     * @param {number} [options.frameSpacing=0] The space between each frame.\n     * @param {number} [options.loop=1] 0 = anim play once and stops at the end, 1 = anim loops to frame 1 at the end, 2 = anim will play in reverse when reaching the end, then plays again, etc.\n     * @returns {Deferred} a deferred object that's resolved once the animation is ready.\n     * @example\n     * // creates a new animation from the image run.png\n     * mySprite.addAnimation ('running', 'run.png', {\n     *    frameWidth: 32\n     * })\n     */","meta":{"range":[5000,6514],"filename":"Sprite.js","lineno":152,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100005878","name":"Sprite#addAnimation","type":"MethodDefinition","paramnames":["name","id","options"]},"vars":{"":null}},"description":"Adds a new animation to the sprite","params":[{"type":{"names":["String"]},"description":"The name of the new animation.","name":"name"},{"type":{"names":["String"]},"description":"The id of the resource (image) to use for the animation.","name":"id"},{"type":{"names":["Object"]},"optional":true,"defaultvalue":"{}","description":"The animation to add, see:","name":"options"},{"type":{"names":["number"]},"optional":true,"defaultvalue":0,"description":"The x offset of the sprite frames inside the image.","name":"options.offsetX"},{"type":{"names":["number"]},"optional":true,"defaultvalue":0,"description":"The y offset of the sprite frames inside the image.","name":"options.offsetY"},{"type":{"names":["number"]},"optional":true,"description":"The width of a frame.","name":"options.frameWidth"},{"type":{"names":["number"]},"optional":true,"defaultvalue":"imageHeight","description":"The height of a frame. By default frameHeight is taken from image.naturalHeight.","name":"options.frameHeight"},{"type":{"names":["number"]},"optional":true,"defaultvalue":1,"description":"The duration of a frame (1 = 16ms).","name":"options.frameDuration"},{"type":{"names":["number"]},"optional":true,"defaultvalue":0,"description":"The space between each frame.","name":"options.frameSpacing"},{"type":{"names":["number"]},"optional":true,"defaultvalue":1,"description":"0 = anim play once and stops at the end, 1 = anim loops to frame 1 at the end, 2 = anim will play in reverse when reaching the end, then plays again, etc.","name":"options.loop"}],"returns":[{"type":{"names":["Deferred"]},"description":"a deferred object that's resolved once the animation is ready."}],"examples":["// creates a new animation from the image run.png\nmySprite.addAnimation ('running', 'run.png', {\n   frameWidth: 32\n})"],"name":"addAnimation","longname":"Sprite#addAnimation","kind":"function","memberof":"Sprite","scope":"instance","$longname":"Sprite#addAnimation"},{"comment":"/**\n     * Add a new Child to the object.\n     *\n     * Childs are automatically rendered and moved when the parent object is.\n     *\n     * @param {Drawable} child The child to add.\n     *\n     * @note children are automatically added to the scene/map of the parent object.\n     */","meta":{"range":[24998,25139],"filename":"Drawable.js","lineno":877,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003691","name":"Drawable#addChild","type":"MethodDefinition","paramnames":["child"]},"vars":{"":null}},"description":"Add a new Child to the object.\n\nChilds are automatically rendered and moved when the parent object is.","params":[{"type":{"names":["Drawable"]},"description":"The child to add.","name":"child"}],"tags":[{"originalTitle":"note","title":"note","text":"children are automatically added to the scene/map of the parent object.","value":"children are automatically added to the scene/map of the parent object."}],"name":"addChild","longname":"Sprite#addChild","kind":"function","memberof":"Sprite","scope":"instance","inherits":"Drawable#addChild","inherited":true,"$longname":"Sprite#addChild"},{"comment":"/**\n     * Add a new handler to be called after each move of the object\n     *\n     * @param {Function} cb The callback to add.\n     */","meta":{"range":[20765,20827],"filename":"Drawable.js","lineno":731,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003406","name":"Drawable#addMoveHandler","type":"MethodDefinition","paramnames":["cb"]},"vars":{"":null}},"description":"Add a new handler to be called after each move of the object","params":[{"type":{"names":["function"]},"description":"The callback to add.","name":"cb"}],"name":"addMoveHandler","longname":"Sprite#addMoveHandler","kind":"function","memberof":"Sprite","scope":"instance","inherits":"Drawable#addMoveHandler","inherited":true,"$longname":"Sprite#addMoveHandler"},{"comment":"/**\n     * advanceFrame is called at each render loop and waits for currentAnim.frameDuration\n     * before advancing to the next animation frame.\n     *\n     * @param {String} animName The name to advance.\n     *\n     * If animName != currentAnimName then switches to the new animation\n     */","meta":{"range":[13160,13569],"filename":"Sprite.js","lineno":389,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100006616","name":"Sprite#advanceFrame","type":"MethodDefinition","paramnames":["animName"]},"vars":{"":null}},"description":"advanceFrame is called at each render loop and waits for currentAnim.frameDuration\nbefore advancing to the next animation frame.","params":[{"type":{"names":["String"]},"description":"The name to advance.\n\nIf animName != currentAnimName then switches to the new animation","name":"animName"}],"name":"advanceFrame","longname":"Sprite#advanceFrame","kind":"function","memberof":"Sprite","scope":"instance","$longname":"Sprite#advanceFrame"},{"comment":"/**\n     * Performs an animation on the object using one of the defined {FX} effects\n     *\n     * Effects change the object size/position using an interpolation function.\n     *\n     * Athena has the following effects:\n     * - {Fade} performs a fade\n     * - {Mosaic} performs a SNES-like mosaic effect\n     * - {Rotate} performs a rotation on the object\n     *\n     * @param {String} fxName The name of the effect to use.\n     * @param {Object} options The options of the effect.\n     * @param {String} [options.easing=\"linear\"] The easing functions to use, can be: 'linear', 'swing', 'easeInQuad', 'easeOutBounce'.\n     *\n     * @returns {Promise} a promise that will be fullfilled when the effect has been completed\n     */","meta":{"range":[22444,23247],"filename":"Drawable.js","lineno":787,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003490","name":"Drawable#animate","type":"MethodDefinition","paramnames":["fxName","options"]},"vars":{"":null}},"description":"Performs an animation on the object using one of the defined {FX} effects\n\nEffects change the object size/position using an interpolation function.\n\nAthena has the following effects:\n- {Fade} performs a fade\n- {Mosaic} performs a SNES-like mosaic effect\n- {Rotate} performs a rotation on the object","params":[{"type":{"names":["String"]},"description":"The name of the effect to use.","name":"fxName"},{"type":{"names":["Object"]},"description":"The options of the effect.","name":"options"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"linear\"","description":"The easing functions to use, can be: 'linear', 'swing', 'easeInQuad', 'easeOutBounce'.","name":"options.easing"}],"returns":[{"type":{"names":["Promise"]},"description":"a promise that will be fullfilled when the effect has been completed"}],"name":"animate","longname":"Sprite#animate","kind":"function","memberof":"Sprite","scope":"instance","inherits":"Drawable#animate","inherited":true,"$longname":"Sprite#animate"},{"comment":"/**\n     * Stops the object from moving, optionnaly immediately going to target position\n     *\n     * @param {Boolean} [gotoTarget=false] Set to true to go to the target position.\n     */","meta":{"range":[8766,8998],"filename":"Drawable.js","lineno":305,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002243","name":"Drawable#cancelMoveTo","type":"MethodDefinition","paramnames":["gotoTarget"]},"vars":{"":null}},"description":"Stops the object from moving, optionnaly immediately going to target position","params":[{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"Set to true to go to the target position.","name":"gotoTarget"}],"name":"cancelMoveTo","longname":"Sprite#cancelMoveTo","kind":"function","memberof":"Sprite","scope":"instance","inherits":"Drawable#cancelMoveTo","inherited":true,"$longname":"Sprite#cancelMoveTo"},{"comment":"/**\n     * Centers the object into the scene.\n     *\n     * @returns {Drawable} this\n     */","meta":{"range":[9101,9292],"filename":"Drawable.js","lineno":320,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002280","name":"Drawable#center","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Centers the object into the scene.","returns":[{"type":{"names":["Drawable"]},"description":"this"}],"name":"center","longname":"Sprite#center","kind":"function","memberof":"Sprite","scope":"instance","params":[],"inherits":"Drawable#center","inherited":true,"$longname":"Sprite#center"},{"comment":"/**\n     * Centers the sprite horizontaly around a tile\n     *\n     * @param {Object} tilePos The tile to center the sprite on.\n     */","meta":{"range":[16063,16439],"filename":"Sprite.js","lineno":501,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100006816","name":"Sprite#centerXOverTile","type":"MethodDefinition","paramnames":["tilePos"]},"vars":{"":null}},"description":"Centers the sprite horizontaly around a tile","params":[{"type":{"names":["Object"]},"description":"The tile to center the sprite on.","name":"tilePos"}],"name":"centerXOverTile","longname":"Sprite#centerXOverTile","kind":"function","memberof":"Sprite","scope":"instance","$longname":"Sprite#centerXOverTile"},{"comment":"/**\n     * Stop using a particular behavior.\n     *\n     * The vx and vy properties of the object will be set to zero.\n     */","meta":{"range":[10033,10117],"filename":"Drawable.js","lineno":349,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002359","name":"Drawable#clearBehavior","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Stop using a particular behavior.\n\nThe vx and vy properties of the object will be set to zero.","name":"clearBehavior","longname":"Sprite#clearBehavior","kind":"function","memberof":"Sprite","scope":"instance","params":[],"inherits":"Drawable#clearBehavior","inherited":true,"$longname":"Sprite#clearBehavior"},{"comment":"/**\n     * Stops current animation from running\n     *\n     * TODO: rename this method\n     */","meta":{"range":[16544,16623],"filename":"Sprite.js","lineno":517,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100006863","name":"Sprite#clearMove","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Stops current animation from running\n\nTODO: rename this method","name":"clearMove","longname":"Sprite#clearMove","kind":"function","memberof":"Sprite","scope":"instance","params":[],"$longname":"Sprite#clearMove"},{"comment":"/**\n     * Destroy is called when an object is removed from a scene or object\n     *\n     * @note calling destroy on a parent will automatically call the destroy method of each child.\n     */","meta":{"range":[28118,28636],"filename":"Drawable.js","lineno":984,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003963","name":"Drawable#destroy","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Destroy is called when an object is removed from a scene or object","tags":[{"originalTitle":"note","title":"note","text":"calling destroy on a parent will automatically call the destroy method of each child.","value":"calling destroy on a parent will automatically call the destroy method of each child."}],"name":"destroy","longname":"Sprite#destroy","kind":"function","memberof":"Sprite","scope":"instance","params":[],"inherits":"Drawable#destroy","inherited":true,"$longname":"Sprite#destroy"},{"comment":"/**\n     * Returns the angle property of the object.\n     * \n     * @returns {Number} The angle of the object\n     */","meta":{"range":[14335,14380],"filename":"Drawable.js","lineno":510,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002734","name":"Drawable#getAngle","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the angle property of the object.","returns":[{"type":{"names":["Number"]},"description":"The angle of the object"}],"name":"getAngle","longname":"Sprite#getAngle","kind":"function","memberof":"Sprite","scope":"instance","params":[],"inherits":"Drawable#getAngle","inherited":true,"$longname":"Sprite#getAngle"},{"comment":"/**\n     * @returns {Number} the height of current animation frame\n     */","meta":{"range":[13849,13955],"filename":"Sprite.js","lineno":415,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100006686","name":"Sprite#getCurrentHeight","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"returns":[{"type":{"names":["Number"]},"description":"the height of current animation frame"}],"name":"getCurrentHeight","longname":"Sprite#getCurrentHeight","kind":"function","memberof":"Sprite","scope":"instance","params":[],"overrides":"Drawable#getCurrentHeight","$longname":"Sprite#getCurrentHeight"},{"comment":"/**\n     * Returns the x offset in the spritesheet of current animation frame\n     *\n     * @returns {number} current frame horizontal offset in the spritesheet\n     */","meta":{"range":[14134,14203],"filename":"Sprite.js","lineno":425,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100006696","name":"Sprite#getCurrentOffsetX","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the x offset in the spritesheet of current animation frame","returns":[{"type":{"names":["number"]},"description":"current frame horizontal offset in the spritesheet"}],"name":"getCurrentOffsetX","longname":"Sprite#getCurrentOffsetX","kind":"function","memberof":"Sprite","scope":"instance","params":[],"$longname":"Sprite#getCurrentOffsetX"},{"comment":"/**\n     * Returns the y offset in the spritesheet of current animation frame\n     *\n     * @returns {number} current frame vertical offset in the spritesheet\n     */","meta":{"range":[14380,14449],"filename":"Sprite.js","lineno":434,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100006706","name":"Sprite#getCurrentOffsetY","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the y offset in the spritesheet of current animation frame","returns":[{"type":{"names":["number"]},"description":"current frame vertical offset in the spritesheet"}],"name":"getCurrentOffsetY","longname":"Sprite#getCurrentOffsetY","kind":"function","memberof":"Sprite","scope":"instance","params":[],"$longname":"Sprite#getCurrentOffsetY"},{"comment":"/**\n     * @returns {Number} The width of current animation frame\n     *\n     */","meta":{"range":[13660,13764],"filename":"Sprite.js","lineno":407,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100006676","name":"Sprite#getCurrentWidth","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"returns":[{"type":{"names":["Number"]},"description":"The width of current animation frame"}],"name":"getCurrentWidth","longname":"Sprite#getCurrentWidth","kind":"function","memberof":"Sprite","scope":"instance","params":[],"overrides":"Drawable#getCurrentWidth","$longname":"Sprite#getCurrentWidth"},{"comment":"/**\n     * Returns the hitBox of current animation frame\n     *\n     * @returns {Object} the hitbox\n     *\n     * @example\n     *\n     * { x: 0, y: 0, x2: 10, y2: 10 }\n     */","meta":{"range":[15361,15560],"filename":"Sprite.js","lineno":471,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100006740","name":"Sprite#getHitBox","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the hitBox of current animation frame","returns":[{"type":{"names":["Object"]},"description":"the hitbox"}],"examples":["{ x: 0, y: 0, x2: 10, y2: 10 }"],"name":"getHitBox","longname":"Sprite#getHitBox","kind":"function","memberof":"Sprite","scope":"instance","params":[],"overrides":"Drawable#getHitBox","$longname":"Sprite#getHitBox"},{"comment":"/**\n     * Returns hitbox position\n     *\n     * @returns {Object} the hitbox position using current sprite position\n     */","meta":{"range":[15695,15917],"filename":"Sprite.js","lineno":485,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100006770","name":"Sprite#getHitBox2","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns hitbox position","returns":[{"type":{"names":["Object"]},"description":"the hitbox position using current sprite position"}],"name":"getHitBox2","longname":"Sprite#getHitBox2","kind":"function","memberof":"Sprite","scope":"instance","params":[],"$longname":"Sprite#getHitBox2"},{"comment":"/**\n     * Returns the current opacity of the object\n     *\n     * @returns {number} The current opacity value.\n     */","meta":{"range":[8518,8567],"filename":"Drawable.js","lineno":296,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002235","name":"Drawable#getOpacity","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns the current opacity of the object","returns":[{"type":{"names":["number"]},"description":"The current opacity value."}],"name":"getOpacity","longname":"Sprite#getOpacity","kind":"function","memberof":"Sprite","scope":"instance","params":[],"inherits":"Drawable#getOpacity","inherited":true,"$longname":"Sprite#getOpacity"},{"comment":"/**\n     * Returns previously seved position\n     *\n     * @returns {Object} The saved position\n     */","meta":{"range":[13162,13271],"filename":"Drawable.js","lineno":455,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002683","name":"Drawable#getSavedPosition","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns previously seved position","returns":[{"type":{"names":["Object"]},"description":"The saved position"}],"name":"getSavedPosition","longname":"Sprite#getSavedPosition","kind":"function","memberof":"Sprite","scope":"instance","params":[],"inherits":"Drawable#getSavedPosition","inherited":true,"$longname":"Sprite#getSavedPosition"},{"comment":"/**\n     * Hides the object\n     *\n     * @returns {Drawable} this\n     */","meta":{"range":[14710,14776],"filename":"Drawable.js","lineno":532,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002759","name":"Drawable#hide","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Hides the object","returns":[{"type":{"names":["Drawable"]},"description":"this"}],"name":"hide","longname":"Sprite#hide","kind":"function","memberof":"Sprite","scope":"instance","params":[],"inherits":"Drawable#hide","inherited":true,"$longname":"Sprite#hide"},{"comment":"/**\n     * Performs collision tests on the specifed object.\n     *\n     * @param {Drawable} obj The object to perform test on\n     *\n     * @returns {Boolean} Returns true if this and obj collide\n     */","meta":{"range":[19080,20353],"filename":"Drawable.js","lineno":678,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003151","name":"Drawable#hitTest","type":"MethodDefinition","paramnames":["obj"]},"vars":{"":null}},"description":"Performs collision tests on the specifed object.","params":[{"type":{"names":["Drawable"]},"description":"The object to perform test on","name":"obj"}],"returns":[{"type":{"names":["Boolean"]},"description":"Returns true if this and obj collide"}],"name":"hitTest","longname":"Sprite#hitTest","kind":"function","memberof":"Sprite","scope":"instance","inherits":"Drawable#hitTest","inherited":true,"$longname":"Sprite#hitTest"},{"comment":"/**\n     * Init default sprite properties\n     */","meta":{"range":[2732,3467],"filename":"Sprite.js","lineno":88,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100005763","name":"Sprite#initProperties","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Init default sprite properties","name":"initProperties","longname":"Sprite#initProperties","kind":"function","memberof":"Sprite","scope":"instance","params":[],"$longname":"Sprite#initProperties"},{"comment":"/**\n     * Loads animations from settings, flipping sprites if needed\n     * and sets the last animation of the array as current animation\n     *\n     * @param {Object} [anims] The animations map to load.\n     */","meta":{"range":[6737,7523],"filename":"Sprite.js","lineno":213,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100006038","name":"Sprite#load","type":"MethodDefinition","paramnames":["anims"]},"vars":{"":null}},"description":"Loads animations from settings, flipping sprites if needed\nand sets the last animation of the array as current animation","params":[{"type":{"names":["Object"]},"optional":true,"description":"The animations map to load.","name":"anims"}],"name":"load","longname":"Sprite#load","kind":"function","memberof":"Sprite","scope":"instance","$longname":"Sprite#load"},{"comment":"/**\n     * Moves the object to a new destination.\n     *\n     * @param {number} x The new horizontal position.\n     * @param {number} y The new vertical position.\n     * @param {number} [duration=0] The duration of the move, 0 to have the object move immediately to new position.\n     *\n     * @returns {Drawable} this\n     */","meta":{"range":[6272,6991],"filename":"Drawable.js","lineno":217,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001981","name":"Drawable#moveTo","type":"MethodDefinition","paramnames":["x","y","duration"]},"vars":{"":null}},"description":"Moves the object to a new destination.","params":[{"type":{"names":["number"]},"description":"The new horizontal position.","name":"x"},{"type":{"names":["number"]},"description":"The new vertical position.","name":"y"},{"type":{"names":["number"]},"optional":true,"defaultvalue":0,"description":"The duration of the move, 0 to have the object move immediately to new position.","name":"duration"}],"returns":[{"type":{"names":["Drawable"]},"description":"this"}],"name":"moveTo","longname":"Sprite#moveTo","kind":"function","memberof":"Sprite","scope":"instance","inherits":"Drawable#moveTo","inherited":true,"$longname":"Sprite#moveTo"},{"comment":"/**\n     * Goes to the next animation frame\n     *\n     * When reaching the last frame, the next frame will depend on animation.loop property:\n     *\n     * - if loop == 2 then animation will play back in reverse mode, up to the first frame\n     * - if loop == 1 then animation will play back from the begining so nextFrame = 0\n     * - if loop == 0/undefined then animation will stop and sprite._onAnimateEnd is called\n     */","meta":{"range":[10638,12425],"filename":"Sprite.js","lineno":321,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100006403","name":"Sprite#nextFrame","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Goes to the next animation frame\n\nWhen reaching the last frame, the next frame will depend on animation.loop property:\n\n- if loop == 2 then animation will play back in reverse mode, up to the first frame\n- if loop == 1 then animation will play back from the begining so nextFrame = 0\n- if loop == 0/undefined then animation will stop and sprite._onAnimateEnd is called","name":"nextFrame","longname":"Sprite#nextFrame","kind":"function","memberof":"Sprite","scope":"instance","params":[],"$longname":"Sprite#nextFrame"},{"comment":"/**\n     * Sends a notification to listeners\n     *\n     * @note: this is a simple wrapper to the NotificationManageger's notify method\n     *\n     * @param {String} id name of the event to send\n     * @param {Object} data data to send with the event, default = empty object\n     */","meta":{"range":[27760,27836],"filename":"Drawable.js","lineno":973,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003941","name":"Drawable#notify","type":"MethodDefinition","paramnames":["id","data"]},"vars":{"":null}},"description":"Sends a notification to listeners","tags":[{"originalTitle":"note:","title":"note:","text":"this is a simple wrapper to the NotificationManageger's notify method","value":"this is a simple wrapper to the NotificationManageger's notify method"}],"params":[{"type":{"names":["String"]},"description":"name of the event to send","name":"id"},{"type":{"names":["Object"]},"description":"data to send with the event, default = empty object","name":"data"}],"name":"notify","longname":"Sprite#notify","kind":"function","memberof":"Sprite","scope":"instance","inherits":"Drawable#notify","inherited":true,"$longname":"Sprite#notify"},{"comment":"/**\n     * Adds a new function that will be called when a new animation is ran\n     *\n     * @param {Function} func The callback function to add.\n     */","meta":{"range":[19579,19668],"filename":"Sprite.js","lineno":613,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100007102","name":"Sprite#onAnimationChange","type":"MethodDefinition","paramnames":["func"]},"vars":{"":null}},"description":"Adds a new function that will be called when a new animation is ran","params":[{"type":{"names":["function"]},"description":"The callback function to add.","name":"func"}],"name":"onAnimationChange","longname":"Sprite#onAnimationChange","kind":"function","memberof":"Sprite","scope":"instance","$longname":"Sprite#onAnimationChange"},{"comment":"/**\n     * Adds a new function that will be called when current animation ends\n     *\n     * @param {Function} func The callback to execute.\n     */","meta":{"range":[19270,19415],"filename":"Sprite.js","lineno":603,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100007083","name":"Sprite#onAnimationEnd","type":"MethodDefinition","paramnames":["func"]},"vars":{"":null}},"description":"Adds a new function that will be called when current animation ends","params":[{"type":{"names":["function"]},"description":"The callback to execute.","name":"func"}],"name":"onAnimationEnd","longname":"Sprite#onAnimationEnd","kind":"function","memberof":"Sprite","scope":"instance","$longname":"Sprite#onAnimationEnd"},{"comment":"/**\n     * onCollision is called on each collision with the object.\n     *\n     * This method does nothing and should be extended if needed.\n     *\n     */","meta":{"range":[24683,24705],"filename":"Drawable.js","lineno":864,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003687","name":"Drawable#onCollision","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"onCollision is called on each collision with the object.\n\nThis method does nothing and should be extended if needed.","name":"onCollision","longname":"Sprite#onCollision","kind":"function","memberof":"Sprite","scope":"instance","params":[],"inherits":"Drawable#onCollision","inherited":true,"$longname":"Sprite#onCollision"},{"comment":"/**\n     * onHit is called when a collision has been detect between the sprite and another graphical object\n     *\n     * @param {Drawable} obj The graphical object that collided.\n     */","meta":{"range":[20473,20632],"filename":"Sprite.js","lineno":644,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100007153","name":"Sprite#onHit","type":"MethodDefinition","paramnames":["obj"]},"vars":{"":null}},"description":"onHit is called when a collision has been detect between the sprite and another graphical object","params":[{"type":{"names":["Drawable"]},"description":"The graphical object that collided.","name":"obj"}],"name":"onHit","longname":"Sprite#onHit","kind":"function","memberof":"Sprite","scope":"instance","overrides":"Drawable#onHit","$longname":"Sprite#onHit"},{"comment":"/**\n     * Plays the spcified sound\n     *\n     * @param {String} id The id of the sound to play.\n     * @param {Object} options\n     * @param {Boolean} [options.pan=true] Set pan to true if you want to use panning.\n     * @param {Boolean} [options.loop=false] Set to true to loop the sound.\n     */","meta":{"range":[26781,27467],"filename":"Drawable.js","lineno":943,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003823","name":"Drawable#playSound","type":"MethodDefinition","paramnames":["id","options"]},"vars":{"":null}},"description":"Plays the spcified sound","params":[{"type":{"names":["String"]},"description":"The id of the sound to play.","name":"id"},{"type":{"names":["Object"]},"name":"options"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":true,"description":"Set pan to true if you want to use panning.","name":"options.pan"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"Set to true to loop the sound.","name":"options.loop"}],"name":"playSound","longname":"Sprite#playSound","kind":"function","memberof":"Sprite","scope":"instance","inherits":"Drawable#playSound","inherited":true,"$longname":"Sprite#playSound"},{"comment":"/**\n     * Remove every children from the object.\n     */","meta":{"range":[25612,25780],"filename":"Drawable.js","lineno":903,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003759","name":"Drawable#removeAllChildren","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Remove every children from the object.","name":"removeAllChildren","longname":"Sprite#removeAllChildren","kind":"function","memberof":"Sprite","scope":"instance","params":[],"inherits":"Drawable#removeAllChildren","inherited":true,"$longname":"Sprite#removeAllChildren"},{"comment":"/**\n     * Remove a child from the object\n     *\n     * @param {Drawable} child The child to remove from the object.\n     *\n     * @note: removing a child object will call its `destroy` method.\n     */","meta":{"range":[25351,25544],"filename":"Drawable.js","lineno":891,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003720","name":"Drawable#removeChild","type":"MethodDefinition","paramnames":["child"]},"vars":{"":null}},"description":"Remove a child from the object","params":[{"type":{"names":["Drawable"]},"description":"The child to remove from the object.","name":"child"}],"tags":[{"originalTitle":"note:","title":"note:","text":"removing a child object will call its `destroy` method.","value":"removing a child object will call its `destroy` method."}],"name":"removeChild","longname":"Sprite#removeChild","kind":"function","memberof":"Sprite","scope":"instance","inherits":"Drawable#removeChild","inherited":true,"$longname":"Sprite#removeChild"},{"comment":"/**\n     * User customized reset method\n     */","meta":{"range":[3584,3600],"filename":"Drawable.js","lineno":119,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001682","name":"Drawable#reset","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"User customized reset method","name":"reset","longname":"Sprite#reset","kind":"function","memberof":"Sprite","scope":"instance","params":[],"inherits":"Drawable#reset","inherited":true,"$longname":"Sprite#reset"},{"comment":"/**\n     * Restores the previous context globalAlpha property.\n     *\n     * @param {RenderingContext} ctx The context.\n     */","meta":{"range":[15480,15550],"filename":"Drawable.js","lineno":568,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002804","name":"Drawable#restoreCtxAlpha","type":"MethodDefinition","paramnames":["ctx"]},"vars":{"":null}},"description":"Restores the previous context globalAlpha property.","params":[{"type":{"names":["RenderingContext"]},"description":"The context.","name":"ctx"}],"name":"restoreCtxAlpha","longname":"Sprite#restoreCtxAlpha","kind":"function","memberof":"Sprite","scope":"instance","inherits":"Drawable#restoreCtxAlpha","inherited":true,"$longname":"Sprite#restoreCtxAlpha"},{"comment":"/**\n     * Restore animation to a previous saved state\n     *\n     * @related {storeCurrentAnim}\n     */","meta":{"range":[12751,12855],"filename":"Sprite.js","lineno":377,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100006600","name":"Sprite#restorePreviousAnim","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Restore animation to a previous saved state","tags":[{"originalTitle":"related","title":"related","text":"{storeCurrentAnim}","value":"{storeCurrentAnim}"}],"name":"restorePreviousAnim","longname":"Sprite#restorePreviousAnim","kind":"function","memberof":"Sprite","scope":"instance","params":[],"$longname":"Sprite#restorePreviousAnim"},{"comment":"/**\n     * Plays the animation from the end up to the first frame\n     */","meta":{"range":[9950,10200],"filename":"Sprite.js","lineno":304,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100006355","name":"Sprite#rewind","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Plays the animation from the end up to the first frame","name":"rewind","longname":"Sprite#rewind","kind":"function","memberof":"Sprite","scope":"instance","params":[],"$longname":"Sprite#rewind"},{"comment":"/**\n     * Saves current object position into `savedX` and `savedY` properties\n     */","meta":{"range":[12966,13048],"filename":"Drawable.js","lineno":445,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002663","name":"Drawable#savePosition","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Saves current object position into `savedX` and `savedY` properties","name":"savePosition","longname":"Sprite#savePosition","kind":"function","memberof":"Sprite","scope":"instance","params":[],"inherits":"Drawable#savePosition","inherited":true,"$longname":"Sprite#savePosition"},{"comment":"/**\n     * Change the angle of an object\n     *\n     * @param {number} angle The new angle of the object. 0 < angle < 360.\n     *\n     * @note This property is only used for the rendering and it's ignored for collisions.\n     */","meta":{"range":[14109,14207],"filename":"Drawable.js","lineno":500,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002723","name":"Drawable#setAngle","type":"MethodDefinition","paramnames":["angle"]},"vars":{"":null}},"description":"Change the angle of an object","params":[{"type":{"names":["number"]},"description":"The new angle of the object. 0 < angle < 360.","name":"angle"}],"tags":[{"originalTitle":"note","title":"note","text":"This property is only used for the rendering and it's ignored for collisions.","value":"This property is only used for the rendering and it's ignored for collisions."}],"name":"setAngle","longname":"Sprite#setAngle","kind":"function","memberof":"Sprite","scope":"instance","inherits":"Drawable#setAngle","inherited":true,"$longname":"Sprite#setAngle"},{"comment":"/**\n     * Changes the sprite's current animation\n     *\n     * @param {String} anim The new animation to play.\n     * @param {Function} [fn=undefined] An optionnal callback to run when the animation will have ended.\n     * @param {number} [frameNum=0] The first frame to play, defaults to zero.\n     * @param {Boolean} [revert=false] Whether to start playing the animation from the last frame.\n     */","meta":{"range":[17036,18473],"filename":"Sprite.js","lineno":530,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100006873","name":"Sprite#setAnimation","type":"MethodDefinition","paramnames":["anim","fn","frameNum","revert"]},"vars":{"":null}},"description":"Changes the sprite's current animation","params":[{"type":{"names":["String"]},"description":"The new animation to play.","name":"anim"},{"type":{"names":["function"]},"optional":true,"description":"An optionnal callback to run when the animation will have ended.","name":"fn"},{"type":{"names":["number"]},"optional":true,"defaultvalue":0,"description":"The first frame to play, defaults to zero.","name":"frameNum"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"Whether to start playing the animation from the last frame.","name":"revert"}],"name":"setAnimation","longname":"Sprite#setAnimation","kind":"function","memberof":"Sprite","scope":"instance","$longname":"Sprite#setAnimation"},{"comment":"/**\n     * Sets a new behavior to the object: this will be called in the move loop\n     *\n     * @param {(String|Behavior)} behavior Either the name of a standard behavior or a Behavior class to use.\n     * @param {Object} [options={}] The options of the behavior (may depend on the behavior type).\n     *\n     * @related {Behavior}\n     */","meta":{"range":[9643,9896],"filename":"Drawable.js","lineno":336,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002322","name":"Drawable#setBehavior","type":"MethodDefinition","paramnames":["behavior","options"]},"vars":{"":null}},"description":"Sets a new behavior to the object: this will be called in the move loop","params":[{"type":{"names":["String","Behavior"]},"description":"Either the name of a standard behavior or a Behavior class to use.","name":"behavior"},{"type":{"names":["Object"]},"optional":true,"defaultvalue":"{}","description":"The options of the behavior (may depend on the behavior type).","name":"options"}],"tags":[{"originalTitle":"related","title":"related","text":"{Behavior}","value":"{Behavior}"}],"name":"setBehavior","longname":"Sprite#setBehavior","kind":"function","memberof":"Sprite","scope":"instance","inherits":"Drawable#setBehavior","inherited":true,"$longname":"Sprite#setBehavior"},{"comment":"/**\n     * Changes the source image for this sprite\n     *\n     * @param {Image} image the new Image to use as spritesheet.\n     * @param {Boolean} [force=false] will replace current image with a new one if force == false.\n     */","meta":{"range":[9345,9866],"filename":"Sprite.js","lineno":281,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100006298","name":"Sprite#setImage","type":"MethodDefinition","paramnames":["image","force"]},"vars":{"":null}},"description":"Changes the source image for this sprite","params":[{"type":{"names":["Image"]},"description":"the new Image to use as spritesheet.","name":"image"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"will replace current image with a new one if force == false.","name":"force"}],"name":"setImage","longname":"Sprite#setImage","kind":"function","memberof":"Sprite","scope":"instance","overrides":"Drawable#setImage","$longname":"Sprite#setImage"},{"comment":"/**\n     * Sets the map of the object.\n     *\n     * @param {Map} map The map of the object.\n     *\n     * @note you don't usually need to call this method as it's called automatically when adding an object\n     * onto a map.\n     *\n     */","meta":{"range":[5146,5283],"filename":"Drawable.js","lineno":176,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001916","name":"Drawable#setMap","type":"MethodDefinition","paramnames":["map"]},"vars":{"":null}},"description":"Sets the map of the object.","params":[{"type":{"names":["Map"]},"description":"The map of the object.","name":"map"}],"tags":[{"originalTitle":"note","title":"note","text":"you don't usually need to call this method as it's called automatically when adding an object\nonto a map.","value":"you don't usually need to call this method as it's called automatically when adding an object\nonto a map."}],"name":"setMap","longname":"Sprite#setMap","kind":"function","memberof":"Sprite","scope":"instance","inherits":"Drawable#setMap","inherited":true,"$longname":"Sprite#setMap"},{"comment":"/**\n     * Applies a new mask to the object, clipping its drawing onto the scene/map\n     *\n     * @param {Object} mask The new mask to use, set to null to remove the mask.\n     * @param {Boolean} exclude Set to true to have the mask exclude portions of the drawing, in this case mask.color will be used.\n     */","meta":{"range":[8066,8211],"filename":"Drawable.js","lineno":275,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002197","name":"Drawable#setMask","type":"MethodDefinition","paramnames":["mask","exclude"]},"vars":{"":null}},"description":"Applies a new mask to the object, clipping its drawing onto the scene/map","params":[{"type":{"names":["Object"]},"description":"The new mask to use, set to null to remove the mask.","name":"mask","defaultvalue":null},{"type":{"names":["Boolean"]},"description":"Set to true to have the mask exclude portions of the drawing, in this case mask.color will be used.","name":"exclude","defaultvalue":false}],"name":"setMask","longname":"Sprite#setMask","kind":"function","memberof":"Sprite","scope":"instance","inherits":"Drawable#setMask","inherited":true,"$longname":"Sprite#setMask"},{"comment":"/**\n     * Changes the opacity of the object\n     *\n     * @param {number} opacity The new opacity.\n     */","meta":{"range":[8329,8388],"filename":"Drawable.js","lineno":287,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002224","name":"Drawable#setOpacity","type":"MethodDefinition","paramnames":["opacity"]},"vars":{"":null}},"description":"Changes the opacity of the object","params":[{"type":{"names":["number"]},"description":"The new opacity.","name":"opacity"}],"name":"setOpacity","longname":"Sprite#setOpacity","kind":"function","memberof":"Sprite","scope":"instance","inherits":"Drawable#setOpacity","inherited":true,"$longname":"Sprite#setOpacity"},{"comment":"/**\n     * Sets a new path for the object\n     *\n     * @param {Path} path The new path that the object will use when moving.\n     *\n     * @related {Path}\n     */","meta":{"range":[13547,13594],"filename":"Drawable.js","lineno":478,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002701","name":"Drawable#setPath","type":"MethodDefinition","paramnames":["path"]},"vars":{"":null}},"description":"Sets a new path for the object","params":[{"type":{"names":["Path"]},"description":"The new path that the object will use when moving.","name":"path"}],"tags":[{"originalTitle":"related","title":"related","text":"{Path}","value":"{Path}"}],"name":"setPath","longname":"Sprite#setPath","kind":"function","memberof":"Sprite","scope":"instance","inherits":"Drawable#setPath","inherited":true,"$longname":"Sprite#setPath"},{"comment":"/**\n     * WIP Sets the platform of the object. This will be used when platforms will be fully implemented.\n     *\n     * @param {Drawable} platform The platform the object is attached to.\n     */","meta":{"range":[5872,5935],"filename":"Drawable.js","lineno":204,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001970","name":"Drawable#setPlatform","type":"MethodDefinition","paramnames":["platform"]},"vars":{"":null}},"description":"WIP Sets the platform of the object. This will be used when platforms will be fully implemented.","params":[{"type":{"names":["Drawable"]},"description":"The platform the object is attached to.","name":"platform"}],"name":"setPlatform","longname":"Sprite#setPlatform","kind":"function","memberof":"Sprite","scope":"instance","inherits":"Drawable#setPlatform","inherited":true,"$longname":"Sprite#setPlatform"},{"comment":"/**\n     * Change the scale of the object\n     *\n     * @param {number} scale The new scale of the object.\n     *\n     * @note: it's only used when rendering, collision detection is not using the scale yet.\n     */","meta":{"range":[13819,13870],"filename":"Drawable.js","lineno":489,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002712","name":"Drawable#setScale","type":"MethodDefinition","paramnames":["scale"]},"vars":{"":null}},"description":"Change the scale of the object","params":[{"type":{"names":["number"]},"description":"The new scale of the object.","name":"scale"}],"tags":[{"originalTitle":"note:","title":"note:","text":"it's only used when rendering, collision detection is not using the scale yet.","value":"it's only used when rendering, collision detection is not using the scale yet."}],"name":"setScale","longname":"Sprite#setScale","kind":"function","memberof":"Sprite","scope":"instance","inherits":"Drawable#setScale","inherited":true,"$longname":"Sprite#setScale"},{"comment":"/**\n     * Sets the scene of the object.\n     *\n     * @param {Scene} scene The scene of the object.\n     *\n     * @note you don't usually need to call this method as it's called when adding an object onto a scene.\n     */","meta":{"range":[5516,5665],"filename":"Drawable.js","lineno":191,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100001943","name":"Drawable#setScene","type":"MethodDefinition","paramnames":["scene"]},"vars":{"":null}},"description":"Sets the scene of the object.","params":[{"type":{"names":["Scene"]},"description":"The scene of the object.","name":"scene"}],"tags":[{"originalTitle":"note","title":"note","text":"you don't usually need to call this method as it's called when adding an object onto a scene.","value":"you don't usually need to call this method as it's called when adding an object onto a scene."}],"name":"setScene","longname":"Sprite#setScene","kind":"function","memberof":"Sprite","scope":"instance","inherits":"Drawable#setScene","inherited":true,"$longname":"Sprite#setScene"},{"comment":"/**\n     * Show the object\n     *\n     * @returns {Drawable} this\n     */","meta":{"range":[14860,14925],"filename":"Drawable.js","lineno":543,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002771","name":"Drawable#show","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Show the object","returns":[{"type":{"names":["Drawable"]},"description":"this"}],"name":"show","longname":"Sprite#show","kind":"function","memberof":"Sprite","scope":"instance","params":[],"inherits":"Drawable#show","inherited":true,"$longname":"Sprite#show"},{"comment":"/**\n     * Draws the sprite hit box\n     *\n     * @param {RenderingContext} The canvas context where to render the hitbox.\n     */","meta":{"range":[16663,18176],"filename":"Drawable.js","lineno":617,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002857","name":"Drawable#showHitBox","type":"MethodDefinition","paramnames":["ctx"]},"vars":{"":null}},"description":"Draws the sprite hit box","params":[{"type":{"names":["RenderingContext"]},"description":"canvas context where to render the hitbox.","name":"The"}],"name":"showHitBox","longname":"Sprite#showHitBox","kind":"function","memberof":"Sprite","scope":"instance","inherits":"Drawable#showHitBox","inherited":true,"$longname":"Sprite#showHitBox"},{"comment":"/**\n       * Draws a box around objects. This method is called when debugging is enabled.\n       *\n       * @param {RenderingContext} ctx The context where to draw the box.\n       */","meta":{"range":[18369,18743],"filename":"Drawable.js","lineno":656,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003054","name":"Drawable#showObjectBox","type":"MethodDefinition","paramnames":["ctx"]},"vars":{"":null}},"description":"Draws a box around objects. This method is called when debugging is enabled.","params":[{"type":{"names":["RenderingContext"]},"description":"The context where to draw the box.","name":"ctx"}],"name":"showObjectBox","longname":"Sprite#showObjectBox","kind":"function","memberof":"Sprite","scope":"instance","inherits":"Drawable#showObjectBox","inherited":true,"$longname":"Sprite#showObjectBox"},{"comment":"/**\n     * Moves the object by snapping it to the map tiles\n     *\n     * @param {Boolean} isLeft Should we snap to the left?\n     * @param {Boolean} isUp Should we snap to the right?\n     */","meta":{"range":[7193,7743],"filename":"Drawable.js","lineno":248,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100002106","name":"Drawable#snapToMap","type":"MethodDefinition","paramnames":["isLeft","isUp"]},"vars":{"":null}},"description":"Moves the object by snapping it to the map tiles","params":[{"type":{"names":["Boolean"]},"description":"Should we snap to the left?","name":"isLeft"},{"type":{"names":["Boolean"]},"description":"Should we snap to the right?","name":"isUp"}],"name":"snapToMap","longname":"Sprite#snapToMap","kind":"function","memberof":"Sprite","scope":"instance","inherits":"Drawable#snapToMap","inherited":true,"$longname":"Sprite#snapToMap"},{"comment":"/**\n     * Starts/resumes animation playback\n     *\n     * This method only sets `this.running` to true.\n     */","meta":{"range":[19058,19111],"filename":"Sprite.js","lineno":594,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100007073","name":"Sprite#startAnimation","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Starts/resumes animation playback\n\nThis method only sets `this.running` to true.","name":"startAnimation","longname":"Sprite#startAnimation","kind":"function","memberof":"Sprite","scope":"instance","params":[],"$longname":"Sprite#startAnimation"},{"comment":"/**\n     * Stops current running animation\n     *\n     * In some cases, the game may need to stop effects from running before\n     * they are completed. This method proves a way to do so and set an end value.\n     *\n     * @param {any} setEndValue The end value of the animation.\n     */","meta":{"range":[23545,23877],"filename":"Drawable.js","lineno":821,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100003608","name":"Drawable#stopAnimate","type":"MethodDefinition","paramnames":["setEndValue"]},"vars":{"":null}},"description":"Stops current running animation\n\nIn some cases, the game may need to stop effects from running before\nthey are completed. This method proves a way to do so and set an end value.","params":[{"type":{"names":["any"]},"description":"The end value of the animation.","name":"setEndValue"}],"name":"stopAnimate","longname":"Sprite#stopAnimate","kind":"function","memberof":"Sprite","scope":"instance","inherits":"Drawable#stopAnimate","inherited":true,"$longname":"Sprite#stopAnimate"},{"comment":"/**\n     * Stops playing current animation\n     *\n     * @param {Boolean} runPreviousEndMethod Set to false if you don't want to run the end callback functions.\n     */","meta":{"range":[18652,18935],"filename":"Sprite.js","lineno":579,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100007047","name":"Sprite#stopAnimation","type":"MethodDefinition","paramnames":["runPreviousEndMethod"]},"vars":{"":null}},"description":"Stops playing current animation","params":[{"type":{"names":["Boolean"]},"description":"Set to false if you don't want to run the end callback functions.","name":"runPreviousEndMethod"}],"name":"stopAnimation","longname":"Sprite#stopAnimation","kind":"function","memberof":"Sprite","scope":"instance","$longname":"Sprite#stopAnimation"},{"comment":"/**\n     * Save current animation name and frame for later use\n     */","meta":{"range":[12506,12636],"filename":"Sprite.js","lineno":367,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100006580","name":"Sprite#storeCurrentAnim","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Save current animation name and frame for later use","name":"storeCurrentAnim","longname":"Sprite#storeCurrentAnim","kind":"function","memberof":"Sprite","scope":"instance","params":[],"$longname":"Sprite#storeCurrentAnim"},{"comment":"/**\n     * WIP: updateFlipAnimation\n     *\n     * It's possible to define a new animation that is simply the flip of another one\n     * This method copies the frames of the source animation and flips them\n     *\n     * @param {Object} anim The animation to create frames for.\n     * @param {String} flipFrom The name of the animation to use as reference.\n     * @param {Number} flipType The direction of the flip: set to 1 for left/right flip, 2 for top/bottom flip.\n     *\n     */","meta":{"range":[8015,9104],"filename":"Sprite.js","lineno":252,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100006131","name":"Sprite#updateFlipAnimation","type":"MethodDefinition","paramnames":["anim","flipFrom","flipType"]},"vars":{"":null}},"description":"WIP: updateFlipAnimation\n\nIt's possible to define a new animation that is simply the flip of another one\nThis method copies the frames of the source animation and flips them","params":[{"type":{"names":["Object"]},"description":"The animation to create frames for.","name":"anim"},{"type":{"names":["String"]},"description":"The name of the animation to use as reference.","name":"flipFrom"},{"type":{"names":["Number"]},"description":"The direction of the flip: set to 1 for left/right flip, 2 for top/bottom flip.","name":"flipType"}],"name":"updateFlipAnimation","longname":"Sprite#updateFlipAnimation","kind":"function","memberof":"Sprite","scope":"instance","$longname":"Sprite#updateFlipAnimation"}],"$constructor":{"comment":"/**\n     * Creates a new Sprite\n     *\n     * @param {String} type An identifier for this sprite, can be for example `enemy1`,...\n     * @param {Object} options An options hash for the object.\n     * @param {String} options.imageId The id to the spritesheet image to use.\n     * @param {Object} options.animations A map with a key for each animation of the sprite.\n     *\n     * @see {@link #Drawable|Drawable} for additionnal parameters\n     * @example\n     *\n     * let mySprite = new Sprite('gem', {\n     *  imageId: 'objects',\n     *  x: options.x,\n     *  y: options.y,\n     *  pool: options.pool,\n     *  canCollide: true,\n     *  collideGroup: 1,\n     *  animations: {\n     *      mainLoop: {\n     *          frameDuration: 4,\n     *          frames:[{\n     *              offsetX: 136,\n     *              offsetY: 189,\n     *              width: 31,\n     *              height: 31,\n     *              hitBox: {\n     *                  x: 0,\n     *                  y: 0,\n     *                  x2: 31,\n     *                  y2: 31\n     *              },\n     *              plane: 0\n     *          },\n     *               {\n     *              offsetX: 170,\n     *              offsetY: 189,\n     *              width: 31,\n     *              height: 31,\n     *              hitBox: {\n     *                  x: 0,\n     *                  y: 0,\n     *                  x2: 31,\n     *                  y2: 31\n     *              },\n     *              plane: 0\n     *          }],\n     *           loop: 1\n     *       }\n     *    }\n     * });\n     */","meta":{"range":[2313,2672],"filename":"Sprite.js","lineno":73,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100005721","name":"Sprite","type":"MethodDefinition","paramnames":["type","options"]},"vars":{"":null}},"description":"Creates a new Sprite","params":[{"type":{"names":["String"]},"description":"An identifier for this sprite, can be for example `enemy1`,...","name":"type"},{"type":{"names":["Object"]},"description":"An options hash for the object.","name":"options"},{"type":{"names":["String"]},"description":"The id to the spritesheet image to use.","name":"options.imageId"},{"type":{"names":["Object"]},"description":"A map with a key for each animation of the sprite.","name":"options.animations"}],"see":["{@link #Drawable|Drawable} for additionnal parameters"],"examples":["let mySprite = new Sprite('gem', {\n imageId: 'objects',\n x: options.x,\n y: options.y,\n pool: options.pool,\n canCollide: true,\n collideGroup: 1,\n animations: {\n     mainLoop: {\n         frameDuration: 4,\n         frames:[{\n             offsetX: 136,\n             offsetY: 189,\n             width: 31,\n             height: 31,\n             hitBox: {\n                 x: 0,\n                 y: 0,\n                 x2: 31,\n                 y2: 31\n             },\n             plane: 0\n         },\n              {\n             offsetX: 170,\n             offsetY: 189,\n             width: 31,\n             height: 31,\n             hitBox: {\n                 x: 0,\n                 y: 0,\n                 x2: 31,\n                 y2: 31\n             },\n             plane: 0\n         }],\n          loop: 1\n      }\n   }\n});"],"name":"Sprite","longname":"Sprite","kind":"class","scope":"global","undocumented":true,"$longname":"Sprite"}},{"comment":"/**\n * This class allows to handle wave of Drawables.\n *\n * In AthenaJS, waves of enemies can be triggered by certain action onto the map.\n *\n * Once every enemies of a wave have been destroyed, an action can be triggered,\n * for eg. to drop rewards onto the map.\n */","meta":{"range":[315,2631],"filename":"Wave.js","lineno":11,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100008084","name":"Wave","type":"ClassDeclaration","paramnames":["options"]}},"classdesc":"This class allows to handle wave of Drawables.\n\nIn AthenaJS, waves of enemies can be triggered by certain action onto the map.\n\nOnce every enemies of a wave have been destroyed, an action can be triggered,\nfor eg. to drop rewards onto the map.","name":"Wave","longname":"Wave","kind":"class","scope":"global","description":"Creates a new Wave","params":[{"type":{"names":["Object"]},"name":"options"},{"type":{"names":["Number"]},"description":"The size of the Wave.","name":"options.size"},{"type":{"names":["String"]},"description":"The type of wave, ie. what will happen after the wave have been destroyed.","name":"options.type"},{"type":{"names":["Object"]},"description":"The data needed for the `type` trigger.","name":"options.afterDestroyData"}],"$longname":"Wave","$members":[{"comment":"/**\n     * Called when the last element of a wave have been destroyed.\n     *\n     * This destroys the wave itself, triggering an option event\n     *\n     * @param {Drawable} element The last Drawable that was destroyed and triggered the wave destroy.\n     */","meta":{"range":[2144,2629],"filename":"Wave.js","lineno":71,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100008202","name":"Wave#destroy","type":"MethodDefinition","paramnames":["element"]},"vars":{"":null}},"description":"Called when the last element of a wave have been destroyed.\n\nThis destroys the wave itself, triggering an option event","params":[{"type":{"names":["Drawable"]},"description":"The last Drawable that was destroyed and triggered the wave destroy.","name":"element"}],"name":"destroy","longname":"Wave#destroy","kind":"function","memberof":"Wave","scope":"instance","$longname":"Wave#destroy"},{"comment":"/**\n     * Generates the sprite's drawable options, because some parameters, like position\n     * may depend on the wave element's positions\n     *\n     * @param {Drawable} element The element to use as a base\n     *\n     * @returns {Object} The options to pass to the drawable constructor\n     */","meta":{"range":[1526,1874],"filename":"Wave.js","lineno":50,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100008138","name":"Wave#getSpriteOptions","type":"MethodDefinition","paramnames":["element"]},"vars":{"":null}},"description":"Generates the sprite's drawable options, because some parameters, like position\nmay depend on the wave element's positions","params":[{"type":{"names":["Drawable"]},"description":"The element to use as a base","name":"element"}],"returns":[{"type":{"names":["Object"]},"description":"The options to pass to the drawable constructor"}],"name":"getSpriteOptions","longname":"Wave#getSpriteOptions","kind":"function","memberof":"Wave","scope":"instance","$longname":"Wave#getSpriteOptions"},{"comment":"/**\n     * Removes an element from the wave.\n     *\n     * This method gets called once the drawable's `destroy` method is called\n     *\n     * @param {Drawable} element The element that was removed.\n     */","meta":{"range":[1096,1218],"filename":"Wave.js","lineno":34,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100008116","name":"Wave#remove","type":"MethodDefinition","paramnames":["element"]},"vars":{"":null}},"description":"Removes an element from the wave.\n\nThis method gets called once the drawable's `destroy` method is called","params":[{"type":{"names":["Drawable"]},"description":"The element that was removed.","name":"element"}],"name":"remove","longname":"Wave#remove","kind":"function","memberof":"Wave","scope":"instance","$longname":"Wave#remove"}],"$constructor":{"comment":"/**\n     * Creates a new Wave\n     *\n     * @param {Object} options\n     * @param {Number} options.size The size of the Wave.\n     * @param {String} options.type The type of wave, ie. what will happen after the wave have been destroyed.\n     * @param {Object} options.afterDestroyData The data needed for the `type` trigger.\n     */","meta":{"range":[669,878],"filename":"Wave.js","lineno":20,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable","code":{"id":"astnode100008087","name":"Wave","type":"MethodDefinition","paramnames":["options"]},"vars":{"":null}},"description":"Creates a new Wave","params":[{"type":{"names":["Object"]},"name":"options"},{"type":{"names":["Number"]},"description":"The size of the Wave.","name":"options.size"},{"type":{"names":["String"]},"description":"The type of wave, ie. what will happen after the wave have been destroyed.","name":"options.type"},{"type":{"names":["Object"]},"description":"The data needed for the `type` trigger.","name":"options.afterDestroyData"}],"name":"Wave","longname":"Wave","kind":"class","scope":"global","undocumented":true,"$longname":"Wave"}}],"symbols":["BitmapText","BitmapText#addChild","BitmapText#addMoveHandler","BitmapText#animate","BitmapText#cancelMoveTo","BitmapText#center","BitmapText#clearBehavior","BitmapText#clearBuffer","BitmapText#createBuffer","BitmapText#destroy","BitmapText#drawLine","BitmapText#getAngle","BitmapText#getCharOffset","BitmapText#getCurrentHeight","BitmapText#getCurrentWidth","BitmapText#getHitBox","BitmapText#getLines","BitmapText#getNextLineLength","BitmapText#getOpacity","BitmapText#getSavedPosition","BitmapText#hide","BitmapText#hitTest","BitmapText#moveTo","BitmapText#notify","BitmapText#onCollision","BitmapText#onHit","BitmapText#playSound","BitmapText#removeAllChildren","BitmapText#removeChild","BitmapText#renderText","BitmapText#reset","BitmapText#restoreCtxAlpha","BitmapText#savePosition","BitmapText#scrollFromBottom","BitmapText#scrollFromTop","BitmapText#setAngle","BitmapText#setBehavior","BitmapText#setFontParams","BitmapText#setImage","BitmapText#setMap","BitmapText#setMask","BitmapText#setOpacity","BitmapText#setPath","BitmapText#setPlatform","BitmapText#setScale","BitmapText#setScene","BitmapText#setText","BitmapText#show","BitmapText#showHitBox","BitmapText#showObjectBox","BitmapText#snapToMap","BitmapText#stopAnimate","BitmapText#update","Drawable","Drawable#addChild","Drawable#addMoveHandler","Drawable#animate","Drawable#cancelMoveTo","Drawable#center","Drawable#clearBehavior","Drawable#destroy","Drawable#getAngle","Drawable#getCurrentHeight","Drawable#getCurrentWidth","Drawable#getHitBox","Drawable#getOpacity","Drawable#getSavedPosition","Drawable#hide","Drawable#hitTest","Drawable#moveTo","Drawable#notify","Drawable#onCollision","Drawable#onHit","Drawable#playSound","Drawable#removeAllChildren","Drawable#removeChild","Drawable#reset","Drawable#restoreCtxAlpha","Drawable#savePosition","Drawable#setAngle","Drawable#setBehavior","Drawable#setImage","Drawable#setMap","Drawable#setMask","Drawable#setOpacity","Drawable#setPath","Drawable#setPlatform","Drawable#setScale","Drawable#setScene","Drawable#show","Drawable#showHitBox","Drawable#showObjectBox","Drawable#snapToMap","Drawable#stopAnimate","Menu","Menu#addChild","Menu#addMenuItem","Menu#addMenuItems","Menu#addMoveHandler","Menu#animate","Menu#cancelMoveTo","Menu#center","Menu#clearBehavior","Menu#destroy","Menu#getAngle","Menu#getCurrentHeight","Menu#getCurrentWidth","Menu#getHitBox","Menu#getOpacity","Menu#getSavedPosition","Menu#hide","Menu#hitTest","Menu#moveTo","Menu#notify","Menu#onCollision","Menu#onHit","Menu#playSound","Menu#removeAllChildren","Menu#removeChild","Menu#reset","Menu#restoreCtxAlpha","Menu#savePosition","Menu#setAngle","Menu#setBehavior","Menu#setImage","Menu#setMap","Menu#setMask","Menu#setOpacity","Menu#setPath","Menu#setPlatform","Menu#setScale","Menu#setScene","Menu#setText","Menu#show","Menu#showHitBox","Menu#showObjectBox","Menu#snapToMap","Menu#stopAnimate","Paint","Paint#addChild","Paint#addMoveHandler","Paint#animate","Paint#arc","Paint#cancelMoveTo","Paint#center","Paint#circle","Paint#clearBehavior","Paint#destroy","Paint#fill","Paint#getAngle","Paint#getCurrentHeight","Paint#getCurrentWidth","Paint#getHitBox","Paint#getOpacity","Paint#getSavedPosition","Paint#hide","Paint#hitTest","Paint#moveTo","Paint#notify","Paint#onCollision","Paint#onHit","Paint#playSound","Paint#rect","Paint#removeAllChildren","Paint#removeChild","Paint#render","Paint#reset","Paint#restoreCtxAlpha","Paint#savePosition","Paint#setAngle","Paint#setBehavior","Paint#setImage","Paint#setMap","Paint#setMask","Paint#setOpacity","Paint#setPath","Paint#setPlatform","Paint#setScale","Paint#setScene","Paint#show","Paint#showHitBox","Paint#showObjectBox","Paint#snapToMap","Paint#stopAnimate","SimpleText","SimpleText#addChild","SimpleText#addMoveHandler","SimpleText#animate","SimpleText#cancelMoveTo","SimpleText#center","SimpleText#clearBehavior","SimpleText#clearBuffer","SimpleText#createBuffer","SimpleText#destroy","SimpleText#getAngle","SimpleText#getCurrentHeight","SimpleText#getCurrentOffsetX","SimpleText#getCurrentOffsetY","SimpleText#getCurrentWidth","SimpleText#getHitBox","SimpleText#getMetrics","SimpleText#getOpacity","SimpleText#getSavedPosition","SimpleText#hide","SimpleText#hitTest","SimpleText#moveTo","SimpleText#notify","SimpleText#onCollision","SimpleText#onHit","SimpleText#playSound","SimpleText#prepareRender","SimpleText#removeAllChildren","SimpleText#removeChild","SimpleText#renderText","SimpleText#reset","SimpleText#restoreCtxAlpha","SimpleText#savePosition","SimpleText#setAngle","SimpleText#setBehavior","SimpleText#setColor","SimpleText#setImage","SimpleText#setMap","SimpleText#setMask","SimpleText#setOpacity","SimpleText#setPath","SimpleText#setPlatform","SimpleText#setScale","SimpleText#setScene","SimpleText#setSize","SimpleText#setText","SimpleText#show","SimpleText#showHitBox","SimpleText#showObjectBox","SimpleText#snapToMap","SimpleText#stopAnimate","Sprite","Sprite#addAnimation","Sprite#addChild","Sprite#addMoveHandler","Sprite#advanceFrame","Sprite#animate","Sprite#cancelMoveTo","Sprite#center","Sprite#centerXOverTile","Sprite#clearBehavior","Sprite#clearMove","Sprite#destroy","Sprite#getAngle","Sprite#getCurrentHeight","Sprite#getCurrentOffsetX","Sprite#getCurrentOffsetY","Sprite#getCurrentWidth","Sprite#getHitBox","Sprite#getHitBox2","Sprite#getOpacity","Sprite#getSavedPosition","Sprite#hide","Sprite#hitTest","Sprite#initProperties","Sprite#load","Sprite#moveTo","Sprite#nextFrame","Sprite#notify","Sprite#onAnimationChange","Sprite#onAnimationEnd","Sprite#onCollision","Sprite#onHit","Sprite#playSound","Sprite#removeAllChildren","Sprite#removeChild","Sprite#reset","Sprite#restoreCtxAlpha","Sprite#restorePreviousAnim","Sprite#rewind","Sprite#savePosition","Sprite#setAngle","Sprite#setAnimation","Sprite#setBehavior","Sprite#setImage","Sprite#setMap","Sprite#setMask","Sprite#setOpacity","Sprite#setPath","Sprite#setPlatform","Sprite#setScale","Sprite#setScene","Sprite#show","Sprite#showHitBox","Sprite#showObjectBox","Sprite#snapToMap","Sprite#startAnimation","Sprite#stopAnimate","Sprite#stopAnimation","Sprite#storeCurrentAnim","Sprite#updateFlipAnimation","Wave","Wave#destroy","Wave#getSpriteOptions","Wave#remove"]},"behaviors":{"documentation":[{"comment":"/**\n * Base class for behaviors.\n *\n * A behavior is a class that describes how a graphical object moves during the time.\n *\n * Every behavior should implement these two methods:\n *\n * - `onUpdate()`\n * \n * - `getMapEvent()`\n *\n */","meta":{"range":[232,1747],"filename":"Behavior.js","lineno":13,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100000002","name":"Behavior","type":"ClassDeclaration","paramnames":["sprite","options"]}},"classdesc":"Base class for behaviors.\n\nA behavior is a class that describes how a graphical object moves during the time.\n\nEvery behavior should implement these two methods:\n\n- `onUpdate()`\n\n- `getMapEvent()`","name":"Behavior","longname":"Behavior","kind":"class","scope":"global","description":"Base class constructor","params":[{"type":{"names":["Drawable"]},"description":"The sprite to attach the behavior to.","name":"sprite"},{"type":{"names":["Object"]},"description":"An hash with behavior-specific properties.","name":"options"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"The object's gravity.","name":"options.gravity"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"The object's horizontal velocity.","name":"options.vx"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"The object's vertical velocity.","name":"options.vy"},{"type":{"names":["function"]},"optional":true,"description":"An optional callback to call when changing vx direction.","name":"options.onVXChange"},{"type":{"names":["function"]},"optional":true,"description":"An optional callback to call when changing vy direction.","name":"options.onVYChange"}],"$longname":"Behavior","$members":[{"comment":"/**\n     * Returns current mapEvent\n     * \n     * @returns {MapEvent} the object's current map event\n     */","meta":{"range":[1676,1745],"filename":"Behavior.js","lineno":51,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100000109","name":"Behavior#getMapEvent","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns current mapEvent","returns":[{"type":{"names":["MapEvent"]},"description":"the object's current map event"}],"name":"getMapEvent","longname":"Behavior#getMapEvent","kind":"function","memberof":"Behavior","scope":"instance","params":[],"$longname":"Behavior#getMapEvent"},{"comment":"/**\n     * Called at each update tick\n     * \n     * @param {Number} t The current timestamp\n     */","meta":{"range":[1509,1556],"filename":"Behavior.js","lineno":42,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100000105","name":"Behavior#onUpdate","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Called at each update tick","params":[{"type":{"names":["Number"]},"description":"The current timestamp","name":"t"}],"name":"onUpdate","longname":"Behavior#onUpdate","kind":"function","memberof":"Behavior","scope":"instance","$longname":"Behavior#onUpdate"}],"$constructor":{"comment":"/**\n     * Base class constructor\n     * \n     * @param {Drawable} sprite The sprite to attach the behavior to.\n     * @param {Object} options An hash with behavior-specific properties.\n     * @param {Number} [options.gravity=0] The object's gravity.\n     * @param {Number} [options.vx=0] The object's horizontal velocity.\n     * @param {Number} [options.vy=0] The object's vertical velocity.\n     * @param {Function} [options.onVXChange=undefined] An optional callback to call when changing vx direction.\n     * @param {Function} [options.onVYChange=undefined] An optional callback to call when changing vy direction.\n     */","meta":{"range":[884,1398],"filename":"Behavior.js","lineno":25,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100000005","name":"Behavior","type":"MethodDefinition","paramnames":["sprite","options"]},"vars":{"":null}},"description":"Base class constructor","params":[{"type":{"names":["Drawable"]},"description":"The sprite to attach the behavior to.","name":"sprite"},{"type":{"names":["Object"]},"description":"An hash with behavior-specific properties.","name":"options"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"The object's gravity.","name":"options.gravity"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"The object's horizontal velocity.","name":"options.vx"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"The object's vertical velocity.","name":"options.vy"},{"type":{"names":["function"]},"optional":true,"description":"An optional callback to call when changing vx direction.","name":"options.onVXChange"},{"type":{"names":["function"]},"optional":true,"description":"An optional callback to call when changing vy direction.","name":"options.onVYChange"}],"name":"Behavior","longname":"Behavior","kind":"class","scope":"global","undocumented":true,"$longname":"Behavior"}},{"comment":"/**\n * This class keeps track of all behaviors available for the game.\n */","meta":{"range":[309,1003],"filename":"Behaviors.js","lineno":13,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100000153","name":"Behaviors","type":"ClassDeclaration","paramnames":[]}},"classdesc":"This class keeps track of all behaviors available for the game.","name":"Behaviors","longname":"Behaviors","kind":"class","scope":"global","description":"Creates the Behaviors class","params":[],"$longname":"Behaviors","$members":[{"comment":"/**\n     * Adds a new behavior which will be available for the game\n     * \n     * @param {String} behaviorName The name of the behavior.\n     * @param {Function} BehaviorClass The Behavior Class to add.\n     */","meta":{"range":[621,718],"filename":"Behaviors.js","lineno":25,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100000160","name":"Behaviors#addBehavior","type":"MethodDefinition","paramnames":["behaviorName","BehaviorClass"]},"vars":{"":null}},"description":"Adds a new behavior which will be available for the game","params":[{"type":{"names":["String"]},"description":"The name of the behavior.","name":"behaviorName"},{"type":{"names":["function"]},"description":"The Behavior Class to add.","name":"BehaviorClass"}],"name":"addBehavior","longname":"Behaviors#addBehavior","kind":"function","memberof":"Behaviors","scope":"instance","$longname":"Behaviors#addBehavior"},{"comment":"/**\n     * Retrieves a behavior using its name\n     * \n     * @param {String} behaviorName The name of the behavior to get.\n     * \n     * @returns {Behavior} The Behavior Class or undefined.\n     */","meta":{"range":[928,1001],"filename":"Behaviors.js","lineno":36,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100000172","name":"Behaviors#getBehavior","type":"MethodDefinition","paramnames":["behaviorName"]},"vars":{"":null}},"description":"Retrieves a behavior using its name","params":[{"type":{"names":["String"]},"description":"The name of the behavior to get.","name":"behaviorName"}],"returns":[{"type":{"names":["Behavior"]},"description":"The Behavior Class or undefined."}],"name":"getBehavior","longname":"Behaviors#getBehavior","kind":"function","memberof":"Behaviors","scope":"instance","$longname":"Behaviors#getBehavior"}],"$constructor":{"comment":"/**\n     * Creates the Behaviors class\n     */","meta":{"range":[382,399],"filename":"Behaviors.js","lineno":17,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100000156","name":"Behaviors","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Creates the Behaviors class","name":"Behaviors","longname":"Behaviors","kind":"class","scope":"global","params":[],"undocumented":true,"$longname":"Behaviors"}},{"comment":"/**\n * GroundMove is a simple behavior that causes an object to move along the horizontal\n * axis until a wall or an hole is reached.\n *\n *\n * @see {@link #Behavior|Behavior}\n * @extends Behavior\n */","meta":{"range":[324,2230],"filename":"GroundMove.js","lineno":14,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100000240","name":"GroundMove","type":"ClassDeclaration","paramnames":["sprite","options"]}},"classdesc":"GroundMove is a simple behavior that causes an object to move along the horizontal\naxis until a wall or an hole is reached.","see":["{@link #Behavior|Behavior}"],"augments":["Behavior"],"name":"GroundMove","longname":"GroundMove","kind":"class","scope":"global","description":"Creates a new GroundMove behavior","params":[{"type":{"names":["Sprite"]},"description":"The sprite to attach the behavior to.","name":"sprite"},{"type":{"names":["Object"]},"description":"General behavior & GroundMove specific options","name":"options"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"right\"","description":"The initial direction of the move, default = `right`.","name":"options.direction"}],"$longname":"GroundMove","$members":[{"comment":"/**\n     * Returns current mapEvent\n     * \n     * @returns {MapEvent} the object's current map event\n     */","meta":{"range":[1676,1745],"filename":"Behavior.js","lineno":51,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100000109","name":"Behavior#getMapEvent","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns current mapEvent","returns":[{"type":{"names":["MapEvent"]},"description":"the object's current map event"}],"name":"getMapEvent","longname":"GroundMove#getMapEvent","kind":"function","memberof":"GroundMove","scope":"instance","params":[],"inherits":"Behavior#getMapEvent","inherited":true,"$longname":"GroundMove#getMapEvent"},{"comment":"/**\n     * Simple onMove handler that checks for a wall or hole\n     *\n     */","meta":{"range":[1093,2228],"filename":"GroundMove.js","lineno":40,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100000309","name":"GroundMove#onUpdate","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Simple onMove handler that checks for a wall or hole","name":"onUpdate","longname":"GroundMove#onUpdate","kind":"function","memberof":"GroundMove","scope":"instance","params":[],"overrides":"Behavior#onUpdate","$longname":"GroundMove#onUpdate"}],"$constructor":{"comment":"/**\n     * Creates a new GroundMove behavior\n     *\n     * @param {Sprite} sprite The sprite to attach the behavior to.\n     * @param {Object} options General behavior & GroundMove specific options\n     * @param {String} [options.direction=\"right\"] The initial direction of the move, default = `right`.\n     */","meta":{"range":[679,1004],"filename":"GroundMove.js","lineno":22,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100000244","name":"GroundMove","type":"MethodDefinition","paramnames":["sprite","options"]},"vars":{"":null}},"description":"Creates a new GroundMove behavior","params":[{"type":{"names":["Sprite"]},"description":"The sprite to attach the behavior to.","name":"sprite"},{"type":{"names":["Object"]},"description":"General behavior & GroundMove specific options","name":"options"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"right\"","description":"The initial direction of the move, default = `right`.","name":"options.direction"}],"name":"GroundMove","longname":"GroundMove","kind":"class","scope":"global","undocumented":true,"$longname":"GroundMove"}},{"comment":"/**\n * InOut behavior class: a very simple behavior used for the Gods game\n * \n * This behavior makes the object move verticaly from a minY to a maxY\n */","meta":{"range":[229,1449],"filename":"InOut.js","lineno":9,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100000549","name":"InOut","type":"ClassDeclaration","paramnames":["sprite","options"]}},"classdesc":"InOut behavior class: a very simple behavior used for the Gods game\n\nThis behavior makes the object move verticaly from a minY to a maxY","name":"InOut","longname":"InOut","kind":"class","scope":"global","description":"Creates a new InOut behavior","params":[{"type":{"names":["Drawable"]},"description":"The drawable to attach the behavior to.","name":"sprite"},{"type":{"names":["Object"]},"description":"The InOut's options.","name":"options"},{"type":{"names":["Number"]},"optional":true,"description":"Object's minimum Y position","name":"options.minY"},{"type":{"names":["Number"]},"optional":true,"description":"Object's maximum Y position","name":"options.maxY"}],"$longname":"InOut","$members":[{"comment":"/**\n     * Called when the game wants to update the Drawable's position\n     * \n     */","meta":{"range":[891,1447],"filename":"InOut.js","lineno":33,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100000600","name":"InOut#onUpdate","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Called when the game wants to update the Drawable's position","name":"onUpdate","longname":"InOut#onUpdate","kind":"function","memberof":"InOut","scope":"instance","params":[],"$longname":"InOut#onUpdate"}],"$constructor":{"comment":"/**\n     * Creates a new InOut behavior\n     * \n     * @param {Drawable} sprite The drawable to attach the behavior to.\n     * @param {Object} options The InOut's options.\n     * @param {Number} [options.minY] Object's minimum Y position\n     * @param {Number} [options.maxY] Object's maximum Y position\n     */","meta":{"range":[580,793],"filename":"InOut.js","lineno":18,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100000553","name":"InOut","type":"MethodDefinition","paramnames":["sprite","options"]},"vars":{"":null}},"description":"Creates a new InOut behavior","params":[{"type":{"names":["Drawable"]},"description":"The drawable to attach the behavior to.","name":"sprite"},{"type":{"names":["Object"]},"description":"The InOut's options.","name":"options"},{"type":{"names":["Number"]},"optional":true,"description":"Object's minimum Y position","name":"options.minY"},{"type":{"names":["Number"]},"optional":true,"description":"Object's maximum Y position","name":"options.maxY"}],"name":"InOut","longname":"InOut","kind":"class","scope":"global","undocumented":true,"$longname":"InOut"}},{"comment":"/**\n * A Path is a special behavior that uses a pre-defined (recorded) path to move\n * an object.\n *\n * @see {@link #Behavior|Behavior}\n * @extends Behavior\n */","meta":{"range":[300,2750],"filename":"Path.js","lineno":14,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100000738","name":"Path","type":"ClassDeclaration","paramnames":["sprite","options"]}},"classdesc":"A Path is a special behavior that uses a pre-defined (recorded) path to move\nan object.","see":["{@link #Behavior|Behavior}"],"augments":["Behavior"],"name":"Path","longname":"Path","kind":"class","scope":"global","description":"Creates a new Path behavior","params":[{"type":{"names":["Drawable"]},"description":"The sprite to attach the behavior to.","name":"sprite"},{"type":{"names":["Object"]},"description":"The options of the behavior.","name":"options"},{"type":{"names":["Array"]},"description":"The nodes of the path: a simple array with nodes[0] = vx, nodes[1] = vy, nodes[2] = vx, nodes[3] = vy,...","name":"options.nodes"},{"type":{"names":["Boolean"]},"description":"Set to true so that when the end of the path is reached, movement goes backwards.","name":"options.reverse"}],"$longname":"Path","$members":[{"comment":"/**\n     * Returns current mapEvent\n     * \n     * @returns {MapEvent} the object's current map event\n     */","meta":{"range":[1676,1745],"filename":"Behavior.js","lineno":51,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100000109","name":"Behavior#getMapEvent","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns current mapEvent","returns":[{"type":{"names":["MapEvent"]},"description":"the object's current map event"}],"name":"getMapEvent","longname":"Path#getMapEvent","kind":"function","memberof":"Path","scope":"instance","params":[],"inherits":"Behavior#getMapEvent","inherited":true,"$longname":"Path#getMapEvent"},{"comment":"/**\n     * Move handler: gets the next vx/vy from `this.nodes`\n     * and makes sure to call onVXChange/onVYChange at each sign change\n     * \n     */","meta":{"range":[1320,2748],"filename":"Path.js","lineno":48,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100000823","name":"Path#onUpdate","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Move handler: gets the next vx/vy from `this.nodes`\nand makes sure to call onVXChange/onVYChange at each sign change","name":"onUpdate","longname":"Path#onUpdate","kind":"function","memberof":"Path","scope":"instance","params":[],"overrides":"Behavior#onUpdate","$longname":"Path#onUpdate"}],"$constructor":{"comment":"/**\n     * Creates a new Path behavior\n     * \n     * @param {Drawable} sprite The sprite to attach the behavior to.\n     * @param {Object} options The options of the behavior.\n     * @param {Array} options.nodes The nodes of the path: a simple array with nodes[0] = vx, nodes[1] = vy, nodes[2] = vx, nodes[3] = vy,...\n     * @param {Boolean} options.reverse Set to true so that when the end of the path is reached, movement goes backwards.\n     */","meta":{"range":[787,1159],"filename":"Path.js","lineno":23,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100000742","name":"Path","type":"MethodDefinition","paramnames":["sprite","options"]},"vars":{"":null}},"description":"Creates a new Path behavior","params":[{"type":{"names":["Drawable"]},"description":"The sprite to attach the behavior to.","name":"sprite"},{"type":{"names":["Object"]},"description":"The options of the behavior.","name":"options"},{"type":{"names":["Array"]},"description":"The nodes of the path: a simple array with nodes[0] = vx, nodes[1] = vy, nodes[2] = vx, nodes[3] = vy,...","name":"options.nodes"},{"type":{"names":["Boolean"]},"description":"Set to true so that when the end of the path is reached, movement goes backwards.","name":"options.reverse"}],"name":"Path","longname":"Path","kind":"class","scope":"global","undocumented":true,"$longname":"Path"}},{"comment":"/**\n * PlayerMove is a behavior that is controlled by the player using keyboard/touch events.\n *\n * To have a sprite controlled by the user you can simply attach this behavior.\n *\n * @see {@link #Behavior|Behavior}\n * @extends Behavior\n */","meta":{"range":[400,20187],"filename":"PlayerMove.js","lineno":14,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100001071","name":"PlayerMove","type":"ClassDeclaration","paramnames":["sprite","options"]}},"classdesc":"PlayerMove is a behavior that is controlled by the player using keyboard/touch events.\n\nTo have a sprite controlled by the user you can simply attach this behavior.","see":["{@link #Behavior|Behavior}"],"augments":["Behavior"],"name":"PlayerMove","longname":"PlayerMove","kind":"class","scope":"global","description":"Creates a new PlayerMove behavior.","params":[{"type":{"names":["Drawable"]},"description":"The sprite to attach the behavior to.","name":"sprite"},{"type":{"names":["Object"]},"description":"Parameters specifics to the behavior","name":"options"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"idle\"","description":"The initial behavior state.","name":"options.startMovement"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"right\"","description":"The initial direction.","name":"options.direction"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"left\"","description":"The initial look direction, can be different than direction.","name":"options.lookDirection"}],"$longname":"PlayerMove","$members":[{"comment":"/**\n     * Returns current mapEvent\n     * \n     * @returns {MapEvent} the object's current map event\n     */","meta":{"range":[1676,1745],"filename":"Behavior.js","lineno":51,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100000109","name":"Behavior#getMapEvent","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Returns current mapEvent","returns":[{"type":{"names":["MapEvent"]},"description":"the object's current map event"}],"name":"getMapEvent","longname":"PlayerMove#getMapEvent","kind":"function","memberof":"PlayerMove","scope":"instance","params":[],"inherits":"Behavior#getMapEvent","inherited":true,"$longname":"PlayerMove#getMapEvent"},{"comment":"/**\n     * onUpdate handler: uses InputManager to get keyboard status and update the sprite's position/state\n     *\n     * @param {Number} t The current timestamp\n     */","meta":{"range":[1496,5053],"filename":"PlayerMove.js","lineno":49,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100001146","name":"PlayerMove#onUpdate","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"onUpdate handler: uses InputManager to get keyboard status and update the sprite's position/state","params":[{"type":{"names":["Number"]},"description":"The current timestamp","name":"t"}],"name":"onUpdate","longname":"PlayerMove#onUpdate","kind":"function","memberof":"PlayerMove","scope":"instance","overrides":"Behavior#onUpdate","$longname":"PlayerMove#onUpdate"}],"$constructor":{"comment":"/**\n     * Creates a new PlayerMove behavior.\n     *\n     * @param {Drawable} sprite The sprite to attach the behavior to.\n     * @param {Object} options Parameters specifics to the behavior\n     * @param {String} [options.startMovement=\"idle\"] The initial behavior state.\n     * @param {String} [options.direction=\"right\"] The initial direction.\n     * @param {String} [options.lookDirection=\"left\"] The initial look direction, can be different than direction.\n     */","meta":{"range":[914,1315],"filename":"PlayerMove.js","lineno":24,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100001075","name":"PlayerMove","type":"MethodDefinition","paramnames":["sprite","options"]},"vars":{"":null}},"description":"Creates a new PlayerMove behavior.","params":[{"type":{"names":["Drawable"]},"description":"The sprite to attach the behavior to.","name":"sprite"},{"type":{"names":["Object"]},"description":"Parameters specifics to the behavior","name":"options"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"idle\"","description":"The initial behavior state.","name":"options.startMovement"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"right\"","description":"The initial direction.","name":"options.direction"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"left\"","description":"The initial look direction, can be different than direction.","name":"options.lookDirection"}],"name":"PlayerMove","longname":"PlayerMove","kind":"class","scope":"global","undocumented":true,"$longname":"PlayerMove"}},{"comment":"/**\n * Simple behavior that makes an object bounce on the ground\n *\n * @param {Drawable} sprite The sprite to attach the behavior to.\n * @param {Object} options The options of the behavior.\n * @param {Number} [options.elasticity=0.80] The elasticity: the closer it is to 1, the higher the bounce.\n * @param {Function} [options.onEnd=undefined] An optional callback to execute when the object stops bouncing.\n * @param {Function} [options.onGround=undefined] An optional callback to execute each time the object touches the ground.\n *\n * @example\n *\n *  sprite.setBehavior('simplefall', {\n *    gravity: 0.3,\n *    onEnd: () => {\n *        this.movable = false;\n *    },\n *    onGround: function() {\n *      AM.play('bounce');\n *    }\n * });\n */","meta":{"range":[855,2627],"filename":"SimpleFall.js","lineno":26,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100004409","name":"SimpleFall","type":"ClassDeclaration","paramnames":["sprite","options"]}},"classdesc":"Simple behavior that makes an object bounce on the ground","params":[{"type":{"names":["Drawable"]},"description":"The sprite to attach the behavior to.","name":"sprite"},{"type":{"names":["Object"]},"description":"The options of the behavior.","name":"options"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":"0.80","description":"The elasticity: the closer it is to 1, the higher the bounce.","name":"options.elasticity"},{"type":{"names":["function"]},"optional":true,"description":"An optional callback to execute when the object stops bouncing.","name":"options.onEnd"},{"type":{"names":["function"]},"optional":true,"description":"An optional callback to execute each time the object touches the ground.","name":"options.onGround"}],"examples":["sprite.setBehavior('simplefall', {\n   gravity: 0.3,\n   onEnd: () => {\n       this.movable = false;\n   },\n   onGround: function() {\n     AM.play('bounce');\n   }\n});"],"name":"SimpleFall","longname":"SimpleFall","kind":"class","scope":"global","$longname":"SimpleFall","$members":[{"comment":"/**\n     * The move handler that gets executed at each move loop.\n     *\n     * Simply calculates the next vertical position using current velocity.\n     * Each time the object reaches the ground, it bounces a little less, using the elasticity property,\n     * until it reaches the ground and stops bouncing.\n     *\n     */","meta":{"range":[1585,2430],"filename":"SimpleFall.js","lineno":46,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100004460","name":"SimpleFall#onUpdate","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"The move handler that gets executed at each move loop.\n\nSimply calculates the next vertical position using current velocity.\nEach time the object reaches the ground, it bounces a little less, using the elasticity property,\nuntil it reaches the ground and stops bouncing.","name":"onUpdate","longname":"SimpleFall#onUpdate","kind":"function","memberof":"SimpleFall","scope":"instance","params":[],"$longname":"SimpleFall#onUpdate"}],"$constructor":{"comment":"","meta":{"range":[895,1251],"filename":"SimpleFall.js","lineno":27,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100004413","name":"SimpleFall","type":"MethodDefinition","paramnames":["sprite","options"]},"vars":{"":null}},"undocumented":true,"name":"SimpleFall","longname":"SimpleFall","kind":"class","scope":"global","params":[],"$longname":"SimpleFall"}},{"comment":"/**\n * Simple behavior that moves horizontally until a wall is reached.\n *\n * @param {Drawable} sprite The sprite to attach the behavior to.\n * @param {Object} options The options of the behavior\n * @param {String} [options.direction=\"left\"] The initial direction of the move, default is `right`.\n *\n */","meta":{"range":[414,1509],"filename":"WeaponMove.js","lineno":13,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100004631","name":"WeaponMove","type":"ClassDeclaration","paramnames":["sprite","options"]}},"classdesc":"Simple behavior that moves horizontally until a wall is reached.","params":[{"type":{"names":["Drawable"]},"description":"The sprite to attach the behavior to.","name":"sprite"},{"type":{"names":["Object"]},"description":"The options of the behavior","name":"options"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"left\"","description":"The initial direction of the move, default is `right`.","name":"options.direction"}],"name":"WeaponMove","longname":"WeaponMove","kind":"class","scope":"global","$longname":"WeaponMove","$members":[{"comment":"/**\n     * The onMove event handler, simply moves updates the object's x using vx and calls VXChange\n     * when it reaches a wall\n     */","meta":{"range":[908,1507],"filename":"WeaponMove.js","lineno":32,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100004692","name":"WeaponMove#onUpdate","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"The onMove event handler, simply moves updates the object's x using vx and calls VXChange\nwhen it reaches a wall","name":"onUpdate","longname":"WeaponMove#onUpdate","kind":"function","memberof":"WeaponMove","scope":"instance","params":[],"$longname":"WeaponMove#onUpdate"}],"$constructor":{"comment":"","meta":{"range":[454,759],"filename":"WeaponMove.js","lineno":14,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Drawable\\Behavior","code":{"id":"astnode100004635","name":"WeaponMove","type":"MethodDefinition","paramnames":["sprite","options"]},"vars":{"":null}},"undocumented":true,"name":"WeaponMove","longname":"WeaponMove","kind":"class","scope":"global","params":[],"$longname":"WeaponMove"}}],"symbols":["Behavior","Behavior#getMapEvent","Behavior#onUpdate","Behaviors","Behaviors#addBehavior","Behaviors#getBehavior","GroundMove","GroundMove#getMapEvent","GroundMove#onUpdate","InOut","InOut#onUpdate","Path","Path#getMapEvent","Path#onUpdate","PlayerMove","PlayerMove#getMapEvent","PlayerMove#onUpdate","SimpleFall","SimpleFall#onUpdate","WeaponMove","WeaponMove#onUpdate"]},"fx":{"documentation":[{"comment":"/**\n * Custom effect that can be used to do any transformation.\n * \n * Supported on: {@link ?api=drawable#Drawable|`Drawable`}, {@link ?api=scene#Scene|`Scene`}\n * \n * @extends Effect\n */","meta":{"range":[220,1450],"filename":"Custom.js","lineno":10,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000163","name":"Custom","type":"ClassDeclaration","paramnames":["options","display"]}},"classdesc":"Custom effect that can be used to do any transformation.\n\nSupported on: {@link ?api=drawable#Drawable|`Drawable`}, {@link ?api=scene#Scene|`Scene`}","augments":["Effect"],"name":"Custom","longname":"Custom","kind":"class","scope":"global","description":"Creates a new Custom effect","params":[{"type":{"names":["Object"]},"description":"Effect options.","name":"options"},{"type":{"names":["function"]},"description":"The callback that will get called at each update tick: this is were the transformation will happen.","name":"options.callback"},{"type":{"names":["Number"]},"description":"the start value of the effect.","name":"options.startValue"},{"type":{"names":["Number"]},"description":"the end value of the effect.","name":"options.endValue"},{"type":{"names":["Boolean"]},"description":"Set to true to make the effect loop.","name":"options.loop"},{"type":{"names":["Display"]},"description":"Reference to the Display in case a buffer is needed.","name":"display"}],"$longname":"Custom","$members":[{"comment":"/**\n     * Process the custom effect: this method simply calls the user's callback\n     * \n     * @param {RenderingContext} ctx The `source`rendering context.\n     * @param {RenderingContext} fxCtx The `destination` context.\n     * \n     * @returns {Boolean} true when the animation has ended.\n     */","meta":{"range":[1274,1448],"filename":"Custom.js","lineno":36,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000198","name":"Custom#process","type":"MethodDefinition","paramnames":["ctx","fxCtx"]},"vars":{"":null}},"description":"Process the custom effect: this method simply calls the user's callback","params":[{"type":{"names":["RenderingContext"]},"description":"The `source`rendering context.","name":"ctx"},{"type":{"names":["RenderingContext"]},"description":"The `destination` context.","name":"fxCtx"}],"returns":[{"type":{"names":["Boolean"]},"description":"true when the animation has ended."}],"name":"process","longname":"Custom#process","kind":"function","memberof":"Custom","scope":"instance","overrides":"Effect#process","$longname":"Custom#process"},{"comment":"/**\n     * Changes the easing function used for the ffect\n     *\n     * @param {Function} easing The new easing function.\n     */","meta":{"range":[1652,1707],"filename":"Effect.js","lineno":45,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000350","name":"Effect#setEasing","type":"MethodDefinition","paramnames":["easing"]},"vars":{"":null}},"description":"Changes the easing function used for the ffect","params":[{"type":{"names":["function"]},"description":"The new easing function.","name":"easing"}],"name":"setEasing","longname":"Custom#setEasing","kind":"function","memberof":"Custom","scope":"instance","inherits":"Effect#setEasing","inherited":true,"$longname":"Custom#setEasing"},{"comment":"/**\n     * Called when the ffect is started.\n     *\n     * This method can be overriden but the super should always be called\n     */","meta":{"range":[1851,2147],"filename":"Effect.js","lineno":54,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000361","name":"Effect#start","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Called when the ffect is started.\n\nThis method can be overriden but the super should always be called","name":"start","longname":"Custom#start","kind":"function","memberof":"Custom","scope":"instance","params":[],"inherits":"Effect#start","inherited":true,"$longname":"Custom#start"},{"comment":"/**\n     * called when the effect is stopped\n     */","meta":{"range":[2210,2272],"filename":"Effect.js","lineno":71,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000406","name":"Effect#stop","type":"MethodDefinition","paramnames":["object","setEndValue"]},"vars":{"":null}},"description":"called when the effect is stopped","name":"stop","longname":"Custom#stop","kind":"function","memberof":"Custom","scope":"instance","params":[],"inherits":"Effect#stop","inherited":true,"$longname":"Custom#stop"}],"$constructor":{"comment":"/**\n     * Creates a new Custom effect\n     * @param {Object} options Effect options.\n     * @param {Function} options.callback The callback that will get called at each update tick: this is were the transformation will happen.\n     * @param {Number} options.startValue the start value of the effect.\n     * @param {Number} options.endValue the end value of the effect.\n     * @param {Boolean} options.loop Set to true to make the effect loop.\n     * @param {Display} display Reference to the Display in case a buffer is needed.\n     */","meta":{"range":[795,962],"filename":"Custom.js","lineno":20,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000167","name":"Custom","type":"MethodDefinition","paramnames":["options","display"]},"vars":{"":null}},"description":"Creates a new Custom effect","params":[{"type":{"names":["Object"]},"description":"Effect options.","name":"options"},{"type":{"names":["function"]},"description":"The callback that will get called at each update tick: this is were the transformation will happen.","name":"options.callback"},{"type":{"names":["Number"]},"description":"the start value of the effect.","name":"options.startValue"},{"type":{"names":["Number"]},"description":"the end value of the effect.","name":"options.endValue"},{"type":{"names":["Boolean"]},"description":"Set to true to make the effect loop.","name":"options.loop"},{"type":{"names":["Display"]},"description":"Reference to the Display in case a buffer is needed.","name":"display"}],"name":"Custom","longname":"Custom","kind":"class","scope":"global","undocumented":true,"$longname":"Custom"}},{"comment":"/**\n * This object contains some built-in easing functions that are used\n * when applying effects and scrollings in AthenaJS.\n */","meta":{"range":[161,819],"filename":"Easing.js","lineno":7,"columnno":6,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Easing","code":{"id":"astnode100000007","name":"Easing","type":"ObjectExpression","value":"{\"undefined\":\"\"}"}},"description":"This object contains some built-in easing functions that are used\nwhen applying effects and scrollings in AthenaJS.","name":"Easing","longname":"Easing","kind":"constant","scope":"global","params":[],"$longname":"Easing"},{"comment":"/**\n * The Effect class allows to apply transformations to Scene & Drawable instances.\n *\n * An effect can modifiy a properties and/or alter the rendering of a scene.\n *\n * Effects can use a custom easing function to allow elastic like animations.\n */","meta":{"range":[297,3538],"filename":"Effect.js","lineno":10,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000239","name":"Effect","type":"ClassDeclaration","paramnames":["options","display"]}},"classdesc":"The Effect class allows to apply transformations to Scene & Drawable instances.\n\nAn effect can modifiy a properties and/or alter the rendering of a scene.\n\nEffects can use a custom easing function to allow elastic like animations.","name":"Effect","longname":"Effect","kind":"class","scope":"global","description":"This the class constructor. Default options are:","params":[{"type":{"names":["Object"]},"name":"options"},{"type":{"names":["Number"]},"description":"The start value of the effect.","name":"options.startValue"},{"type":{"names":["Number"]},"description":"The end value of the effect.","name":"options.endValue"},{"type":{"names":["Number"]},"description":"The duration of the effect (ms).*","name":"options.duration"},{"type":{"names":["Boolean"]},"description":"Set to true to make the effect loop.","name":"options.loop"},{"type":{"names":["Display"]},"description":"Reference to the Display in case a buffer is needed.","name":"display"}],"$longname":"Effect","$members":[{"comment":"/**\n     * Calculates current animation process\n     *\n     * This method can be overridden but the super should always be calle dfirst\n     */","meta":{"range":[2426,3536],"filename":"Effect.js","lineno":80,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000418","name":"Effect#process","type":"MethodDefinition","paramnames":["ctx","fxCtx","obj"]},"vars":{"":null}},"description":"Calculates current animation process\n\nThis method can be overridden but the super should always be calle dfirst","name":"process","longname":"Effect#process","kind":"function","memberof":"Effect","scope":"instance","params":[],"$longname":"Effect#process"},{"comment":"/**\n     * Changes the easing function used for the ffect\n     *\n     * @param {Function} easing The new easing function.\n     */","meta":{"range":[1652,1707],"filename":"Effect.js","lineno":45,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000350","name":"Effect#setEasing","type":"MethodDefinition","paramnames":["easing"]},"vars":{"":null}},"description":"Changes the easing function used for the ffect","params":[{"type":{"names":["function"]},"description":"The new easing function.","name":"easing"}],"name":"setEasing","longname":"Effect#setEasing","kind":"function","memberof":"Effect","scope":"instance","$longname":"Effect#setEasing"},{"comment":"/**\n     * Called when the ffect is started.\n     *\n     * This method can be overriden but the super should always be called\n     */","meta":{"range":[1851,2147],"filename":"Effect.js","lineno":54,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000361","name":"Effect#start","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Called when the ffect is started.\n\nThis method can be overriden but the super should always be called","name":"start","longname":"Effect#start","kind":"function","memberof":"Effect","scope":"instance","params":[],"$longname":"Effect#start"},{"comment":"/**\n     * called when the effect is stopped\n     */","meta":{"range":[2210,2272],"filename":"Effect.js","lineno":71,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000406","name":"Effect#stop","type":"MethodDefinition","paramnames":["object","setEndValue"]},"vars":{"":null}},"description":"called when the effect is stopped","name":"stop","longname":"Effect#stop","kind":"function","memberof":"Effect","scope":"instance","params":[],"$longname":"Effect#stop"}],"$constructor":{"comment":"/**\n     * This the class constructor. Default options are:\n     *\n     * @param {Object} options\n     * @param {Number} options.startValue The start value of the effect.\n     * @param {Number} options.endValue The end value of the effect.\n     * @param {Number} options.duration The duration of the effect (ms).*\n     * @param {Boolean} options.loop Set to true to make the effect loop.\n     * @param {Display} display Reference to the Display in case a buffer is needed.\n     */","meta":{"range":[801,1512],"filename":"Effect.js","lineno":21,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000242","name":"Effect","type":"MethodDefinition","paramnames":["options","display"]},"vars":{"":null}},"description":"This the class constructor. Default options are:","params":[{"type":{"names":["Object"]},"name":"options"},{"type":{"names":["Number"]},"description":"The start value of the effect.","name":"options.startValue"},{"type":{"names":["Number"]},"description":"The end value of the effect.","name":"options.endValue"},{"type":{"names":["Number"]},"description":"The duration of the effect (ms).*","name":"options.duration"},{"type":{"names":["Boolean"]},"description":"Set to true to make the effect loop.","name":"options.loop"},{"type":{"names":["Display"]},"description":"Reference to the Display in case a buffer is needed.","name":"display"}],"name":"Effect","longname":"Effect","kind":"class","scope":"global","undocumented":true,"$longname":"Effect"}},{"comment":"/**\n * Fading effect\n * \n * Supported on: `Drawable`, `Scene`\n * \n * @extends Effect\n */","meta":{"range":[121,1524],"filename":"Fade.js","lineno":10,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000531","name":"Fade","type":"ClassDeclaration","paramnames":["options","display"]}},"classdesc":"Fading effect\n\nSupported on: `Drawable`, `Scene`","augments":["Effect"],"name":"Fade","longname":"Fade","kind":"class","scope":"global","description":"Creates a Fade Effect","params":[{"type":{"names":["Object"]},"name":"options"},{"type":{"names":["Number"]},"description":"the start value of the effect.","name":"options.startValue"},{"type":{"names":["Number"]},"description":"the end value of the effect.","name":"options.endValue"},{"type":{"names":["Boolean"]},"description":"Set to true to make the effect loop.","name":"options.loop"},{"type":{"names":["Display"]},"description":"Reference to the Display in case a buffer is needed.","name":"display"}],"$longname":"Fade","$members":[{"comment":"/**\n     * \n     * @param {enderingContext} ctx The `source`rendering context.\n     * @param {RenderingContext} fxCtx The `destination` context.\n     * @param {Drawable} obj The Drawable on which to execute the ffect.\n     */","meta":{"range":[1311,1522],"filename":"Fade.js","lineno":48,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000612","name":"Fade#process","type":"MethodDefinition","paramnames":["ctx","fxCtx","obj"]},"vars":{"":null}},"params":[{"type":{"names":["enderingContext"]},"description":"The `source`rendering context.","name":"ctx"},{"type":{"names":["RenderingContext"]},"description":"The `destination` context.","name":"fxCtx"},{"type":{"names":["Drawable"]},"description":"The Drawable on which to execute the ffect.","name":"obj"}],"name":"process","longname":"Fade#process","kind":"function","memberof":"Fade","scope":"instance","overrides":"Effect#process","$longname":"Fade#process"},{"comment":"/**\n     * Changes the easing function used for the ffect\n     *\n     * @param {Function} easing The new easing function.\n     */","meta":{"range":[1652,1707],"filename":"Effect.js","lineno":45,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000350","name":"Effect#setEasing","type":"MethodDefinition","paramnames":["easing"]},"vars":{"":null}},"description":"Changes the easing function used for the ffect","params":[{"type":{"names":["function"]},"description":"The new easing function.","name":"easing"}],"name":"setEasing","longname":"Fade#setEasing","kind":"function","memberof":"Fade","scope":"instance","inherits":"Effect#setEasing","inherited":true,"$longname":"Fade#setEasing"},{"comment":"/**\n     * Initializes the effect\n     */","meta":{"range":[956,1075],"filename":"Fade.js","lineno":35,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000597","name":"Fade#start","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Initializes the effect","name":"start","longname":"Fade#start","kind":"function","memberof":"Fade","scope":"instance","params":[],"overrides":"Effect#start","$longname":"Fade#start"},{"comment":"/**\n     * called when the effect is stopped\n     */","meta":{"range":[2210,2272],"filename":"Effect.js","lineno":71,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000406","name":"Effect#stop","type":"MethodDefinition","paramnames":["object","setEndValue"]},"vars":{"":null}},"description":"called when the effect is stopped","name":"stop","longname":"Fade#stop","kind":"function","memberof":"Fade","scope":"instance","params":[],"inherits":"Effect#stop","inherited":true,"$longname":"Fade#stop"}],"$constructor":{"comment":"/**\n     * Creates a Fade Effect\n     * \n     * @param {Object} options\n     * @param {Number} options.startValue the start value of the effect.\n     * @param {Number} options.endValue the end value of the effect.\n     * @param {Boolean} options.loop Set to true to make the effect loop.\n     * @param {Display} display Reference to the Display in case a buffer is needed.\n     */","meta":{"range":[538,904],"filename":"Fade.js","lineno":20,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000535","name":"Fade","type":"MethodDefinition","paramnames":["options","display"]},"vars":{"":null}},"description":"Creates a Fade Effect","params":[{"type":{"names":["Object"]},"name":"options"},{"type":{"names":["Number"]},"description":"the start value of the effect.","name":"options.startValue"},{"type":{"names":["Number"]},"description":"the end value of the effect.","name":"options.endValue"},{"type":{"names":["Boolean"]},"description":"Set to true to make the effect loop.","name":"options.loop"},{"type":{"names":["Display"]},"description":"Reference to the Display in case a buffer is needed.","name":"display"}],"name":"Fade","longname":"Fade","kind":"class","scope":"global","undocumented":true,"$longname":"Fade"}},{"comment":"/**\n * The FX class is the entry point for accessing Drawing effects like Mosaic\n * and easing functions.\n * \n * Effects can be applied to Drawable and/or Scene instances.\n * \n * @see {@link #Effect|Effect}\n */","meta":{"range":[430,1905],"filename":"FX.js","lineno":18,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX","code":{"id":"astnode100001035","name":"FX","type":"ClassDeclaration","paramnames":[]}},"classdesc":"The FX class is the entry point for accessing Drawing effects like Mosaic\nand easing functions.\n\nEffects can be applied to Drawable and/or Scene instances.","see":["{@link #Effect|Effect}"],"name":"FX","longname":"FX","kind":"class","scope":"global","description":"Creates the FX class, adding the linear easing","params":[],"$longname":"FX","$members":[{"comment":"/**\n     * Add a new easing function for other objects to use\n     * \n     * @param {String} easingName The name of the easing.\n     * @param {Function} easingFn The function to be used for easing. This function may use these parameters: `x , t, b, c, d`\n    */","meta":{"range":[1439,1517],"filename":"FX.js","lineno":52,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX","code":{"id":"astnode100001072","name":"FX#addEasing","type":"MethodDefinition","paramnames":["easingName","easingFn"]},"vars":{"":null}},"description":"Add a new easing function for other objects to use","params":[{"type":{"names":["String"]},"description":"The name of the easing.","name":"easingName"},{"type":{"names":["function"]},"description":"The function to be used for easing. This function may use these parameters: `x , t, b, c, d`","name":"easingFn"}],"name":"addEasing","longname":"FX#addEasing","kind":"function","memberof":"FX","scope":"instance","$longname":"FX#addEasing"},{"comment":"/**\n     * Add a new Effect\n     * @param {String} fxName The name of the effect to add.\n     * @param {Effect} FxClass The Effect Class to add.\n     */","meta":{"range":[851,916],"filename":"FX.js","lineno":32,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX","code":{"id":"astnode100001051","name":"FX#addFX","type":"MethodDefinition","paramnames":["fxName","FxClass"]},"vars":{"":null}},"description":"Add a new Effect","params":[{"type":{"names":["String"]},"description":"The name of the effect to add.","name":"fxName"},{"type":{"names":["Effect"]},"description":"The Effect Class to add.","name":"FxClass"}],"name":"addFX","longname":"FX#addFX","kind":"function","memberof":"FX","scope":"instance","$longname":"FX#addFX"},{"comment":"/**\n     * Retrieves an easing function\n     * \n     * @param {String} easingName The name of the easing function to retrive.\n     * @returns {Function} The easing function, or linear function if it didn't exist.\n     */","meta":{"range":[1748,1903],"filename":"FX.js","lineno":62,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX","code":{"id":"astnode100001084","name":"FX#getEasing","type":"MethodDefinition","paramnames":["easingName"]},"vars":{"":null}},"description":"Retrieves an easing function","params":[{"type":{"names":["String"]},"description":"The name of the easing function to retrive.","name":"easingName"}],"returns":[{"type":{"names":["function"]},"description":"The easing function, or linear function if it didn't exist."}],"name":"getEasing","longname":"FX#getEasing","kind":"function","memberof":"FX","scope":"instance","$longname":"FX#getEasing"},{"comment":"/**\n     * Retrieve an effect Class by its name\n     * \n     * @param {String} fxName The name of the Effect to retrive.\n     * @returns {Effect} the effect Class or undefined\n     */","meta":{"range":[1110,1167],"filename":"FX.js","lineno":42,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX","code":{"id":"astnode100001063","name":"FX#getEffect","type":"MethodDefinition","paramnames":["fxName"]},"vars":{"":null}},"description":"Retrieve an effect Class by its name","params":[{"type":{"names":["String"]},"description":"The name of the Effect to retrive.","name":"fxName"}],"returns":[{"type":{"names":["Effect"]},"description":"the effect Class or undefined"}],"name":"getEffect","longname":"FX#getEffect","kind":"function","memberof":"FX","scope":"instance","$longname":"FX#getEffect"}],"$constructor":{"comment":"/**\n     * Creates the FX class, adding the linear easing\n     */","meta":{"range":[515,688],"filename":"FX.js","lineno":22,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX","code":{"id":"astnode100001038","name":"FX","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Creates the FX class, adding the linear easing","name":"FX","longname":"FX","kind":"class","scope":"global","params":[],"undocumented":true,"$longname":"FX"}},{"comment":"/**\n * Test :)\n */","meta":{"range":[2253,2275],"filename":"Mosaic.js","lineno":74,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000854","name":"module.exports","type":"Identifier"}},"description":"Test :)","name":"exports","longname":"module.exports","kind":"member","memberof":"module","scope":"static","$longname":"module.exports"},{"comment":"/**\n * A Mosaic effect that will apply an {@link https://github.com/warpdesign/jquery-mosaic|SNES-like effects}.\n *\n * Supported on: `Drawable`, `Scene`\n *\n * @extends Effect\n */","meta":{"range":[211,2231],"filename":"Mosaic.js","lineno":10,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000660","name":"Mosaic","type":"ClassDeclaration","paramnames":["options","display"]}},"classdesc":"A Mosaic effect that will apply an {@link https://github.com/warpdesign/jquery-mosaic|SNES-like effects}.\n\nSupported on: `Drawable`, `Scene`","augments":["Effect"],"name":"Mosaic","longname":"Mosaic","kind":"class","scope":"global","description":"Creates a new Mosaic effect","params":[{"type":{"names":["Object"]},"name":"options"},{"type":{"names":["Number"]},"description":"The start value of the effect.","name":"options.startValue"},{"type":{"names":["Number"]},"description":"The end value of the effect.","name":"options.endValue"},{"type":{"names":["Number"]},"description":"The duration of the effect (ms).","name":"options.duration"},{"type":{"names":["Boolean"]},"description":"Set to true to make the effect loop.","name":"options.loop"},{"type":{"names":["Display"]},"description":"Reference to the Display in case a buffer is needed.","name":"display"}],"$longname":"Mosaic","$members":[{"comment":"/**\n     * simulates the mosaic effect by using Canvas'drawImage API\n     *\n     * @param {CanvasRenderingConbtext} ctx The source drawing context, which happens to be the destination context as well.\n     */","meta":{"range":[1711,2229],"filename":"Mosaic.js","lineno":54,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000758","name":"Mosaic#process","type":"MethodDefinition","paramnames":["ctx"]},"vars":{"":null}},"description":"simulates the mosaic effect by using Canvas'drawImage API","params":[{"type":{"names":["CanvasRenderingConbtext"]},"description":"The source drawing context, which happens to be the destination context as well.","name":"ctx"}],"name":"process","longname":"Mosaic#process","kind":"function","memberof":"Mosaic","scope":"instance","overrides":"Effect#process","$longname":"Mosaic#process"},{"comment":"/**\n     * Changes the easing function used for the ffect\n     *\n     * @param {Function} easing The new easing function.\n     */","meta":{"range":[1652,1707],"filename":"Effect.js","lineno":45,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000350","name":"Effect#setEasing","type":"MethodDefinition","paramnames":["easing"]},"vars":{"":null}},"description":"Changes the easing function used for the ffect","params":[{"type":{"names":["function"]},"description":"The new easing function.","name":"easing"}],"name":"setEasing","longname":"Mosaic#setEasing","kind":"function","memberof":"Mosaic","scope":"instance","inherits":"Effect#setEasing","inherited":true,"$longname":"Mosaic#setEasing"},{"comment":"/**\n     * Initializes mosaic effect variables\n     */","meta":{"range":[1389,1491],"filename":"Mosaic.js","lineno":42,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000737","name":"Mosaic#start","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Initializes mosaic effect variables","name":"start","longname":"Mosaic#start","kind":"function","memberof":"Mosaic","scope":"instance","params":[],"overrides":"Effect#start","$longname":"Mosaic#start"},{"comment":"/**\n     * called when the effect is stopped\n     */","meta":{"range":[2210,2272],"filename":"Effect.js","lineno":71,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000406","name":"Effect#stop","type":"MethodDefinition","paramnames":["object","setEndValue"]},"vars":{"":null}},"description":"called when the effect is stopped","name":"stop","longname":"Mosaic#stop","kind":"function","memberof":"Mosaic","scope":"instance","params":[],"inherits":"Effect#stop","inherited":true,"$longname":"Mosaic#stop"}],"$constructor":{"comment":"/**\n     * Creates a new Mosaic effect\n     *\n     * @param {Object} options\n     * @param {Number} options.startValue The start value of the effect.\n     * @param {Number} options.endValue The end value of the effect.\n     * @param {Number} options.duration The duration of the effect (ms).\n     * @param {Boolean} options.loop Set to true to make the effect loop.\n     * @param {Display} display Reference to the Display in case a buffer is needed.\n     */","meta":{"range":[708,1324],"filename":"Mosaic.js","lineno":21,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000664","name":"Mosaic","type":"MethodDefinition","paramnames":["options","display"]},"vars":{"":null}},"description":"Creates a new Mosaic effect","params":[{"type":{"names":["Object"]},"name":"options"},{"type":{"names":["Number"]},"description":"The start value of the effect.","name":"options.startValue"},{"type":{"names":["Number"]},"description":"The end value of the effect.","name":"options.endValue"},{"type":{"names":["Number"]},"description":"The duration of the effect (ms).","name":"options.duration"},{"type":{"names":["Boolean"]},"description":"Set to true to make the effect loop.","name":"options.loop"},{"type":{"names":["Display"]},"description":"Reference to the Display in case a buffer is needed.","name":"display"}],"name":"Mosaic","longname":"Mosaic","kind":"class","scope":"global","undocumented":true,"$longname":"Mosaic"}},{"comment":"/**\n * Rotating effect\n * \n * Supported on: `Drawables`\n * \n * @extends Effect\n */","meta":{"range":[115,2064],"filename":"Rotate.js","lineno":10,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000862","name":"Rotate","type":"ClassDeclaration","paramnames":["options","display"]}},"classdesc":"Rotating effect\n\nSupported on: `Drawables`","augments":["Effect"],"name":"Rotate","longname":"Rotate","kind":"class","scope":"global","description":"Creates the Rotate class","params":[{"type":{"names":["Object"]},"description":"* @param {Number} options.startValue the start value of the effect.","name":"options"},{"type":{"names":["Number"]},"description":"the end value of the effect.","name":"options.endValue"},{"type":{"names":["Boolean"]},"description":"Set to true to make the effect loop.","name":"options.loop"},{"type":{"names":["Display"]},"description":"Reference to the Display in case a buffer is needed.","name":"display"}],"$longname":"Rotate","$members":[{"comment":"/**\n     * Calculates the new angle\n     * \n     * @param {RenderingContext} ctx The rendering context (not used in this effect).\n     * @param {RenderingContext} fxCtx Tje effect rendering context (not used).\n     * @param {Drawable} obj Drawable on which to apply the rotation.\n     * \n     * @returns {Boolean} returns true if the animation has ended.\n     */","meta":{"range":[1857,2062],"filename":"Rotate.js","lineno":64,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000968","name":"Rotate#process","type":"MethodDefinition","paramnames":["ctx","fxCtx","obj"]},"vars":{"":null}},"description":"Calculates the new angle","params":[{"type":{"names":["RenderingContext"]},"description":"The rendering context (not used in this effect).","name":"ctx"},{"type":{"names":["RenderingContext"]},"description":"Tje effect rendering context (not used).","name":"fxCtx"},{"type":{"names":["Drawable"]},"description":"Drawable on which to apply the rotation.","name":"obj"}],"returns":[{"type":{"names":["Boolean"]},"description":"returns true if the animation has ended."}],"name":"process","longname":"Rotate#process","kind":"function","memberof":"Rotate","scope":"instance","overrides":"Effect#process","$longname":"Rotate#process"},{"comment":"/**\n     * Changes the easing function used for the ffect\n     *\n     * @param {Function} easing The new easing function.\n     */","meta":{"range":[1652,1707],"filename":"Effect.js","lineno":45,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000350","name":"Effect#setEasing","type":"MethodDefinition","paramnames":["easing"]},"vars":{"":null}},"description":"Changes the easing function used for the ffect","params":[{"type":{"names":["function"]},"description":"The new easing function.","name":"easing"}],"name":"setEasing","longname":"Rotate#setEasing","kind":"function","memberof":"Rotate","scope":"instance","inherits":"Effect#setEasing","inherited":true,"$longname":"Rotate#setEasing"},{"comment":"/**\n     * Initializes the rotate effect\n     */","meta":{"range":[992,1123],"filename":"Rotate.js","lineno":36,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000934","name":"Rotate#start","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Initializes the rotate effect","name":"start","longname":"Rotate#start","kind":"function","memberof":"Rotate","scope":"instance","params":[],"overrides":"Effect#start","$longname":"Rotate#start"},{"comment":"/**\n     * Stops the effect from running, setting the angle to specified endValue\n     * \n     * @param {Drawable} object The object on which changing the angle.\n     * @param {Number} endValue The angle value that will be set when the effect is stopped.\n     */","meta":{"range":[1396,1484],"filename":"Rotate.js","lineno":49,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000951","name":"Rotate#stop","type":"MethodDefinition","paramnames":["object","endValue"]},"vars":{"":null}},"description":"Stops the effect from running, setting the angle to specified endValue","params":[{"type":{"names":["Drawable"]},"description":"The object on which changing the angle.","name":"object"},{"type":{"names":["Number"]},"description":"The angle value that will be set when the effect is stopped.","name":"endValue"}],"name":"stop","longname":"Rotate#stop","kind":"function","memberof":"Rotate","scope":"instance","overrides":"Effect#stop","$longname":"Rotate#stop"}],"$constructor":{"comment":"/**\n     * Creates the Rotate class\n     * \n     * @param {Object} options\n    ** @param {Number} options.startValue the start value of the effect.\n     * @param {Number} options.endValue the end value of the effect.\n     * @param {Boolean} options.loop Set to true to make the effect loop.\n     * @param {Display} display Reference to the Display in case a buffer is needed.\n     */","meta":{"range":[537,933],"filename":"Rotate.js","lineno":20,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\FX\\Effect","code":{"id":"astnode100000866","name":"Rotate","type":"MethodDefinition","paramnames":["options","display"]},"vars":{"":null}},"description":"Creates the Rotate class","params":[{"type":{"names":["Object"]},"description":"* @param {Number} options.startValue the start value of the effect.","name":"options"},{"type":{"names":["Number"]},"description":"the end value of the effect.","name":"options.endValue"},{"type":{"names":["Boolean"]},"description":"Set to true to make the effect loop.","name":"options.loop"},{"type":{"names":["Display"]},"description":"Reference to the Display in case a buffer is needed.","name":"display"}],"name":"Rotate","longname":"Rotate","kind":"class","scope":"global","undocumented":true,"$longname":"Rotate"}}],"symbols":["Custom","Custom#process","Custom#setEasing","Custom#start","Custom#stop","Easing","Effect","Effect#process","Effect#setEasing","Effect#start","Effect#stop","Fade","Fade#process","Fade#setEasing","Fade#start","Fade#stop","FX","FX#addEasing","FX#addFX","FX#getEasing","FX#getEffect","module.exports","Mosaic","Mosaic#process","Mosaic#setEasing","Mosaic#start","Mosaic#stop","Rotate","Rotate#process","Rotate#setEasing","Rotate#start","Rotate#stop"]},"map":{"documentation":[{"comment":"/**\n * The `Map` is used to display tile-based backgrounds. It is usually initialized using a buffer containing\n * tiles and tilebehaviors.\n * \n * It has a viewport so that only a part of the map can be displayed.\n * \n * A map also contains objects that are added onto the map once the viewport reaches a `block`.\n *\n */","meta":{"range":[531,59279],"filename":"Map.js","lineno":19,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100000028","name":"Map","type":"ClassDeclaration","paramnames":["options"]}},"classdesc":"The `Map` is used to display tile-based backgrounds. It is usually initialized using a buffer containing\ntiles and tilebehaviors.\n\nIt has a viewport so that only a part of the map can be displayed.\n\nA map also contains objects that are added onto the map once the viewport reaches a `block`.","name":"Map","longname":"Map","kind":"class","scope":"global","description":"Creates a new Map","params":[{"type":{"names":["Object"]},"name":"options"},{"type":{"names":["String"]},"description":"The url to an image that will be used for the tiles","name":"options.src"},{"type":{"names":["Number"]},"description":"The width of a tile","name":"options.tileWidth"},{"type":{"names":["Number"]},"description":"The height of a tile","name":"options.tileHeight"},{"type":{"names":["Number"]},"description":"The full width of the map","name":"options.width"},{"type":{"names":["Number"]},"description":"The full height of the map","name":"options.height"},{"type":{"names":["Number"]},"description":"The width of the viewport: it is usually the same as the game width. Default = map.width","name":"options.viewportW"},{"type":{"names":["Number"]},"description":"The height of the viewport: it is usually the same as the game height. Default = map.height","name":"options.viewportH"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"Initial x viewport (horizontal scrolling position) of the map.","name":"options.viewportX"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"Initial y viewport (vertical scrolling position) of the map.","name":"options.viewportY"},{"type":{"names":["Array"]},"optional":true,"description":"An optionnal array with the tiles to use for the map.","name":"options.tiles"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"'map'","description":"An optional name for the map.","name":"options.name"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"'linear'","description":"The linear function to use when scrolling the map. Defaults to linear.","name":"options.easing"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"The start x position of the master object.","name":"options.startX"},{"type":{"names":["Sumber"]},"optional":true,"defaultvalue":0,"description":"The start y position of the master object.","name":"options.startY"},{"type":{"names":["ArrayBuffer"]},"description":"The buffer containing width \\* height bytes container tile numbers followed by width*height bytes for the tile behaviors","name":"options.buffer"}],"$longname":"Map","$members":[{"comment":"/**\n\t * Add a new graphical object on to the map, it will be:\n\t *  - displayed if it is visible (in the viewport)\n\t *  - added to collision group\n\t *\n\t * @param {Drawable} obj A reference to the new object to add.\n     * @param {Number} [layerIndex=0] The layer to add the object into.\n\t *\n\t * @note the object will be added to the correct collision group\n\t * if obj.collideGroup is set\n\t *\n\t */","meta":{"range":[11431,12570],"filename":"Map.js","lineno":349,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100000995","name":"Map#addObject","type":"MethodDefinition","paramnames":["obj","layerIndex"]},"vars":{"":null}},"description":"Add a new graphical object on to the map, it will be:\n - displayed if it is visible (in the viewport)\n - added to collision group","params":[{"type":{"names":["Drawable"]},"description":"A reference to the new object to add.","name":"obj"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"The layer to add the object into.","name":"layerIndex"}],"tags":[{"originalTitle":"note","title":"note","text":"the object will be added to the correct collision group\nif obj.collideGroup is set","value":"the object will be added to the correct collision group\nif obj.collideGroup is set"}],"name":"addObject","longname":"Map#addObject","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#addObject"},{"comment":"/**\n     * adds a new tileset for the map\n     *\n     * @param {Array} [tiles=[]] The tile descriptions.\n     *\n     */","meta":{"range":[51953,52200],"filename":"Map.js","lineno":1571,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100004643","name":"Map#addTileSet","type":"MethodDefinition","paramnames":["tiles"]},"vars":{"":null}},"description":"adds a new tileset for the map","params":[{"type":{"names":["Array"]},"optional":true,"defaultvalue":"[]","description":"The tile descriptions.","name":"tiles"}],"name":"addTileSet","longname":"Map#addTileSet","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#addTileSet"},{"comment":"/**\n\t *\n\t * Check for collisions\n\t *\n\t */","meta":{"range":[18551,18757],"filename":"Map.js","lineno":564,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100001593","name":"Map#checkCollisions","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Check for collisions","name":"checkCollisions","longname":"Map#checkCollisions","kind":"function","memberof":"Map","scope":"instance","params":[],"$longname":"Map#checkCollisions"},{"comment":"/**\n     * Checks if an object is in front of a certain type of tileType,\n     * optionnaly centering the object under the tile\n     *\n     * Used when checking if the player can climb a ladder for example\n     *\n     * spaceX/spaceY specify how to reduce the players hitbox\n     *\n     * @param {Drawable} sprite The sprite to check.\n     * @param {Number} tileType The tileType to check for.\n     * @param {Number} [spaceX=0] The x padding that is accepted: if horizontal position is +/- that spaceX, check will succeed.\n     * @param {Number} [spaceY=0] The y padding that is accepted: if vertical position is +/- that spaceX, check will succeed.\n     * @param {Boolean} [center=false] Set to true if you want to sprite to be centered on the tile.\n     *\n     * @returns {Boolean} True if the tile was found, false otherwise\n     *\n     */","meta":{"range":[32811,33371],"filename":"Map.js","lineno":982,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100002771","name":"Map#checkForTileType","type":"MethodDefinition","paramnames":["sprite","tileType","spaceX","spaceY","center"]},"vars":{"":null}},"description":"Checks if an object is in front of a certain type of tileType,\noptionnaly centering the object under the tile\n\nUsed when checking if the player can climb a ladder for example\n\nspaceX/spaceY specify how to reduce the players hitbox","params":[{"type":{"names":["Drawable"]},"description":"The sprite to check.","name":"sprite"},{"type":{"names":["Number"]},"description":"The tileType to check for.","name":"tileType"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"The x padding that is accepted: if horizontal position is +/- that spaceX, check will succeed.","name":"spaceX"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"The y padding that is accepted: if vertical position is +/- that spaceX, check will succeed.","name":"spaceY"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"Set to true if you want to sprite to be centered on the tile.","name":"center"}],"returns":[{"type":{"names":["Boolean"]},"description":"True if the tile was found, false otherwise"}],"name":"checkForTileType","longname":"Map#checkForTileType","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#checkForTileType"},{"comment":"/**\n\t *\n\t * Check for map triggers and handle any found triggers, like enemies or bonus that can appear\n\t * when the player reaches certain positions\n\t *\n\t */","meta":{"range":[18927,19289],"filename":"Map.js","lineno":579,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100001618","name":"Map#checkForTriggers","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Check for map triggers and handle any found triggers, like enemies or bonus that can appear\nwhen the player reaches certain positions","name":"checkForTriggers","longname":"Map#checkForTriggers","kind":"function","memberof":"Map","scope":"instance","params":[],"$longname":"Map#checkForTriggers"},{"comment":"/**\n\t *\n\t * Checks collisions between master bullets and enemies: call hitTest method on\n\t * any frend bullet object with the enemies object as parameter\n\t *\n\t */","meta":{"range":[21898,22388],"filename":"Map.js","lineno":673,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100001896","name":"Map#checkMasterBulletsToEnemiesCollisions","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Checks collisions between master bullets and enemies: call hitTest method on\nany frend bullet object with the enemies object as parameter","name":"checkMasterBulletsToEnemiesCollisions","longname":"Map#checkMasterBulletsToEnemiesCollisions","kind":"function","memberof":"Map","scope":"instance","params":[],"$longname":"Map#checkMasterBulletsToEnemiesCollisions"},{"comment":"/**\n\t *\n\t * Triggers map scrolling depending on the master's position (if needed)\n\t *\n\t */","meta":{"range":[16243,18498],"filename":"Map.js","lineno":516,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100001394","name":"Map#checkMasterPosition","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Triggers map scrolling depending on the master's position (if needed)","name":"checkMasterPosition","longname":"Map#checkMasterPosition","kind":"function","memberof":"Map","scope":"instance","params":[],"$longname":"Map#checkMasterPosition"},{"comment":"/**\n    * Checks collisions between master object and enemies, calling hitTest on any enemie\n    * that collides with the master\n    *\n    * @returns {Boolean} Returns true if the masterSprite was hit, false otherwise.\n    *\n    */","meta":{"range":[22631,23014],"filename":"Map.js","lineno":696,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100001976","name":"Map#checkMasterToEnemiesCollisions","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Checks collisions between master object and enemies, calling hitTest on any enemie\nthat collides with the master","returns":[{"type":{"names":["Boolean"]},"description":"Returns true if the masterSprite was hit, false otherwise."}],"name":"checkMasterToEnemiesCollisions","longname":"Map#checkMasterToEnemiesCollisions","kind":"function","memberof":"Map","scope":"instance","params":[],"$longname":"Map#checkMasterToEnemiesCollisions"},{"comment":"/**\n     * Compares a source matrix with map behaviors, looking for hits\n     *\n     * @param {Array} buffer the source buffer: 0 === empty, 1 === full\n     * @param {Number} matrixWidth the width of the matrix, in pixels\n     * @param {Number} x the x index to start checking inside the map\n     * @param {Number} y the y index to start checking inside the map\n     * @param {Number} behavior the behavior to check for\n     *\n     * @returns {Boolean} true if one or more hits were found, false otherwise\n     */","meta":{"range":[25510,25968],"filename":"Map.js","lineno":784,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100002197","name":"Map#checkMatrixForCollision","type":"MethodDefinition","paramnames":["buffer","matrixWidth","x","y","behavior"]},"vars":{"":null}},"description":"Compares a source matrix with map behaviors, looking for hits","params":[{"type":{"names":["Array"]},"description":"the source buffer: 0 === empty, 1 === full","name":"buffer"},{"type":{"names":["Number"]},"description":"the width of the matrix, in pixels","name":"matrixWidth"},{"type":{"names":["Number"]},"description":"the x index to start checking inside the map","name":"x"},{"type":{"names":["Number"]},"description":"the y index to start checking inside the map","name":"y"},{"type":{"names":["Number"]},"description":"the behavior to check for","name":"behavior"}],"returns":[{"type":{"names":["Boolean"]},"description":"true if one or more hits were found, false otherwise"}],"name":"checkMatrixForCollision","longname":"Map#checkMatrixForCollision","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#checkMatrixForCollision"},{"comment":"/**\n     * Clears the whole map with specified tile number & behavior\n     *\n     * @param {Number} [tileNum=0] Tile number to use for the whole map.\n     * @param {Number} [behavior=Tile.TYPE.AIR] Behavior number to use for the whole map.\n     */","meta":{"range":[52458,52763],"filename":"Map.js","lineno":1588,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100004678","name":"Map#clear","type":"MethodDefinition","paramnames":["tileNum","behavior"]},"vars":{"":null}},"description":"Clears the whole map with specified tile number & behavior","params":[{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"Tile number to use for the whole map.","name":"tileNum"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":"Tile.TYPE.AIR","description":"Behavior number to use for the whole map.","name":"behavior"}],"name":"clear","longname":"Map#clear","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#clear"},{"comment":"/**\n\t * Sets current debug status: when set to true outputs more console logs and may also debug visual stuff\n\t * like map tiles and objects onto the map\n\t *\n\t * @param {Boolean} isDebug Set to true to enable debug.\n\t *\n\t */","meta":{"range":[13563,13699],"filename":"Map.js","lineno":427,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100001172","name":"Map#debug","type":"MethodDefinition","paramnames":["isDebug"]},"vars":{"":null}},"description":"Sets current debug status: when set to true outputs more console logs and may also debug visual stuff\nlike map tiles and objects onto the map","params":[{"type":{"names":["Boolean"]},"description":"Set to true to enable debug.","name":"isDebug"}],"name":"debug","longname":"Map#debug","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#debug"},{"comment":"/**\n\t * Checks if tile at position x,y is `TYPE.WALL` and returns true if it is a wall, false otherwise\n\t *\n\t * @param {Number} x The x position of the tile to check.\n\t * @param {Number} y The y position of the tile to check.\n\t * @returns {Boolean} Returns true if the tile is a wall, false otherwise.\n\t *\n\t * @related {Tile}\n\t */","meta":{"range":[21488,21724],"filename":"Map.js","lineno":659,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100001859","name":"Map#fallTest","type":"MethodDefinition","paramnames":["x","y"]},"vars":{"":null}},"description":"Checks if tile at position x,y is `TYPE.WALL` and returns true if it is a wall, false otherwise","params":[{"type":{"names":["Number"]},"description":"The x position of the tile to check.","name":"x"},{"type":{"names":["Number"]},"description":"The y position of the tile to check.","name":"y"}],"returns":[{"type":{"names":["Boolean"]},"description":"Returns true if the tile is a wall, false otherwise."}],"tags":[{"originalTitle":"related","title":"related","text":"{Tile}","value":"{Tile}"}],"name":"fallTest","longname":"Map#fallTest","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#fallTest"},{"comment":"/**\n     * This method returns min(next `Behavior` tile, distance)\n     *\n     * @param {Sprite} sprite The sprite to check distance with.\n     * @param {Number} distance The maximum (x) distance in pixels.\n     * @param {Number} behavior The behavior we want to check for.\n     *\n     * Returns the minimum distance\n     */","meta":{"range":[26303,27293],"filename":"Map.js","lineno":809,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100002277","name":"Map#getMaxDistanceToTile","type":"MethodDefinition","paramnames":["sprite","distance","behavior"]},"vars":{"":null}},"description":"This method returns min(next `Behavior` tile, distance)","params":[{"type":{"names":["Sprite"]},"description":"The sprite to check distance with.","name":"sprite"},{"type":{"names":["Number"]},"description":"The maximum (x) distance in pixels.","name":"distance"},{"type":{"names":["Number"]},"description":"The behavior we want to check for.\n\nReturns the minimum distance","name":"behavior"}],"name":"getMaxDistanceToTile","longname":"Map#getMaxDistanceToTile","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#getMaxDistanceToTile"},{"comment":"/**\n\t * Returns the tile at (x, y) pixels\n\t *\n\t * @param {number} x The horizontal position in pixels.\n\t * @param {number} y The vertical position in pixels.\n\t *\n\t * @note Position is related to the whole map, not the viewport.\n\t *\n\t * @returns {(Tile|undefined)} The tile that is found at position x, y, undefined if tile `(x, y)` is out of bounds\n\t *\n\t */","meta":{"range":[43974,44209],"filename":"Map.js","lineno":1288,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100003794","name":"Map#getTileAt","type":"MethodDefinition","paramnames":["x","y"]},"vars":{"":null}},"description":"Returns the tile at (x, y) pixels","params":[{"type":{"names":["number"]},"description":"The horizontal position in pixels.","name":"x"},{"type":{"names":["number"]},"description":"The vertical position in pixels.","name":"y"}],"tags":[{"originalTitle":"note","title":"note","text":"Position is related to the whole map, not the viewport.","value":"Position is related to the whole map, not the viewport."}],"returns":[{"type":{"names":["Tile","undefined"]},"description":"The tile that is found at position x, y, undefined if tile `(x, y)` is out of bounds"}],"name":"getTileAt","longname":"Map#getTileAt","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#getTileAt"},{"comment":"/**\n     * Get the behavior at specified index\n     *\n     * @param {Number} col The col number.\n     * @param {Number} row The row number.\n     *\n     * @returns {Number} The behavior found at position (col, row)\n     */","meta":{"range":[44441,44542],"filename":"Map.js","lineno":1308,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100003847","name":"Map#getTileBehaviorAtIndex","type":"MethodDefinition","paramnames":["col","row"]},"vars":{"":null}},"description":"Get the behavior at specified index","params":[{"type":{"names":["Number"]},"description":"The col number.","name":"col"},{"type":{"names":["Number"]},"description":"The row number.","name":"row"}],"returns":[{"type":{"names":["Number"]},"description":"The behavior found at position (col, row)"}],"name":"getTileBehaviorAtIndex","longname":"Map#getTileBehaviorAtIndex","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#getTileBehaviorAtIndex"},{"comment":"/**\n\t * Returns index of the tile at pos (x,y) in map array\n\t *\n\t * @param {number} x Horizontal pixel position.\n\t * @param {number} y Vertical pixel position.\n\t * @returns {Object} Object with i, j tile index\n\t *\n\t */","meta":{"range":[44771,44974],"filename":"Map.js","lineno":1320,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100003865","name":"Map#getTileIndexFromPixel","type":"MethodDefinition","paramnames":["x","y"]},"vars":{"":null}},"description":"Returns index of the tile at pos (x,y) in map array","params":[{"type":{"names":["number"]},"description":"Horizontal pixel position.","name":"x"},{"type":{"names":["number"]},"description":"Vertical pixel position.","name":"y"}],"returns":[{"type":{"names":["Object"]},"description":"Object with i, j tile index"}],"name":"getTileIndexFromPixel","longname":"Map#getTileIndexFromPixel","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#getTileIndexFromPixel"},{"comment":"/**\n     * Returns the pixel position of the specified tile\n     *\n     * @param {Number} col Tile column.\n     * @param {Number} row Tile row.\n     * @returns {Object} an object with x & y properties set with tile pixel position\n     */","meta":{"range":[45222,45357],"filename":"Map.js","lineno":1340,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100003902","name":"Map#getTilePixelPos","type":"MethodDefinition","paramnames":["col","row"]},"vars":{"":null}},"description":"Returns the pixel position of the specified tile","params":[{"type":{"names":["Number"]},"description":"Tile column.","name":"col"},{"type":{"names":["Number"]},"description":"Tile row.","name":"row"}],"returns":[{"type":{"names":["Object"]},"description":"an object with x & y properties set with tile pixel position"}],"name":"getTilePixelPos","longname":"Map#getTilePixelPos","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#getTilePixelPos"},{"comment":"/**\n     * Tests if a rectangle collapses with certain types of tiles\n     * Used when checking colligions between a sprite and walls for example\n     *\n     * @param {number} x\n     * @param {number} y\n     * @param {number} x2\n     * @param {number} y2\n     * @param {number} types\n     * @returns {(Boolean|Object)} True if colision detected\n     *\n     */","meta":{"range":[33742,34578],"filename":"Map.js","lineno":1010,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100002853","name":"Map#hitObjectTest","type":"MethodDefinition","paramnames":["x","y","x2","y2","types"]},"vars":{"":null}},"description":"Tests if a rectangle collapses with certain types of tiles\nUsed when checking colligions between a sprite and walls for example","params":[{"type":{"names":["number"]},"name":"x"},{"type":{"names":["number"]},"name":"y"},{"type":{"names":["number"]},"name":"x2"},{"type":{"names":["number"]},"name":"y2"},{"type":{"names":["number"]},"name":"types"}],"returns":[{"type":{"names":["Boolean","Object"]},"description":"True if colision detected"}],"name":"hitObjectTest","longname":"Map#hitObjectTest","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#hitObjectTest"},{"comment":"/**\n\t * Move movable objects into the map\n\t *\n     * @param {Number} timestamp current time\n\t */","meta":{"range":[13806,14206],"filename":"Map.js","lineno":438,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100001189","name":"Map#moveObjects","type":"MethodDefinition","paramnames":["timestamp"]},"vars":{"":null}},"description":"Move movable objects into the map","params":[{"type":{"names":["Number"]},"description":"current time","name":"timestamp"}],"name":"moveObjects","longname":"Map#moveObjects","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#moveObjects"},{"comment":"/**\n\t * Move platform objects onto the map: they must be moved before normal objects are moved\n\t * so that movable objects move related to the platforms\n\t *\n     * @param {Number} timestamp Current time.\n\t */","meta":{"range":[14425,14601],"filename":"Map.js","lineno":456,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100001221","name":"Map#movePlatforms","type":"MethodDefinition","paramnames":["timestamp"]},"vars":{"":null}},"description":"Move platform objects onto the map: they must be moved before normal objects are moved\nso that movable objects move related to the platforms","params":[{"type":{"names":["Number"]},"description":"Current time.","name":"timestamp"}],"name":"movePlatforms","longname":"Map#movePlatforms","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#movePlatforms"},{"comment":"/**\n\t * Sets a new destination for the viewport: this method doesn't not set it immediately\n\t * but sets a new target instead: if not already moving, new move will happen at each\n\t * render inside the map.update) method.\n     *\n     * This method uses current map.duration and map.easing to perform the move.\n\t *\n\t * @param {number} x The horizontal position to move the viewport at.\n\t * @param {number} y The vertical position to move the viewport at.\n\t *\n\t * @note moveTo will do nothing in case the map is already scrolling\n\t */","meta":{"range":[19832,20718],"filename":"Map.js","lineno":601,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100001694","name":"Map#moveTo","type":"MethodDefinition","paramnames":["x","y"]},"vars":{"":null}},"description":"Sets a new destination for the viewport: this method doesn't not set it immediately\nbut sets a new target instead: if not already moving, new move will happen at each\nrender inside the map.update) method.\n\nThis method uses current map.duration and map.easing to perform the move.","params":[{"type":{"names":["number"]},"description":"The horizontal position to move the viewport at.","name":"x"},{"type":{"names":["number"]},"description":"The vertical position to move the viewport at.","name":"y"}],"tags":[{"originalTitle":"note","title":"note","text":"moveTo will do nothing in case the map is already scrolling","value":"moveTo will do nothing in case the map is already scrolling"}],"name":"moveTo","longname":"Map#moveTo","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#moveTo"},{"comment":"/**\n\t * Send specified event to the NotificationManager\n\t *\n\t * @param {String} eventType The type of event to send.\n\t * @param {Object} data The data to send with the notification.\n\t *\n\t */","meta":{"range":[47246,47313],"filename":"Map.js","lineno":1406,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100004123","name":"Map#notify","type":"MethodDefinition","paramnames":["eventType","data"]},"vars":{"":null}},"description":"Send specified event to the NotificationManager","params":[{"type":{"names":["String"]},"description":"The type of event to send.","name":"eventType"},{"type":{"names":["Object"]},"description":"The data to send with the notification.","name":"data"}],"name":"notify","longname":"Map#notify","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#notify"},{"comment":"/**\n\t * removeObject from the map\n\t *\n\t * @param {Drawable} drawable The object to remove from the map.\n\t *\n\t * @note the object if automatically removed from collision lists\n\t *\n\t */","meta":{"range":[47508,47962],"filename":"Map.js","lineno":1419,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100004136","name":"Map#removeObject","type":"MethodDefinition","paramnames":["drawable"]},"vars":{"":null}},"description":"removeObject from the map","params":[{"type":{"names":["Drawable"]},"description":"The object to remove from the map.","name":"drawable"}],"tags":[{"originalTitle":"note","title":"note","text":"the object if automatically removed from collision lists","value":"the object if automatically removed from collision lists"}],"name":"removeObject","longname":"Map#removeObject","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#removeObject"},{"comment":"/**\n\t *\n\t * Resets the map:\n\t * \t- removes objects from the map\n\t *  - reset windows\n\t *  - reset triggers\n\t *  - reset mapEvents\n\t *  - reset viewport + tileOffset\n\t *  - sets isDirty to true so that map is redrawn\n\t *\n\t * TODO: tileOffset shouldn't be 0 but depends on the master's position\n\t *\n\t */","meta":{"range":[8057,9493],"filename":"Map.js","lineno":234,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100000606","name":"Map#reset","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Resets the map:\n\t- removes objects from the map\n - reset windows\n - reset triggers\n - reset mapEvents\n - reset viewport + tileOffset\n - sets isDirty to true so that map is redrawn\n\nTODO: tileOffset shouldn't be 0 but depends on the master's position","name":"reset","longname":"Map#reset","kind":"function","memberof":"Map","scope":"instance","params":[],"$longname":"Map#reset"},{"comment":"/**\n\t * Resets the master's position to the map.startX/startY position & resets its animation state:\n\t * usually called when player loses a life and needs to be positionned at a checkpoint\n\t *\n\t */","meta":{"range":[7332,7744],"filename":"Map.js","lineno":208,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100000525","name":"Map#respawn","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Resets the master's position to the map.startX/startY position & resets its animation state:\nusually called when player loses a life and needs to be positionned at a checkpoint","name":"respawn","longname":"Map#respawn","kind":"function","memberof":"Map","scope":"instance","params":[],"$longname":"Map#respawn"},{"comment":"/**\n\t * Sets the map tiles and tiletypes from binary buffer:\n\t *  - first (numCols * numRows) bytes are visual tile numbers\n\t *  - last (numCols * numRows) bytes are the tile types (wall, ladder,...)\n\t *\n\t * @param {any} buffer\n\t *\n\t */","meta":{"range":[9961,10178],"filename":"Map.js","lineno":299,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100000854","name":"Map#setBuffer","type":"MethodDefinition","paramnames":["buffer"]},"vars":{"":null}},"description":"Sets the map tiles and tiletypes from binary buffer:\n - first (numCols * numRows) bytes are visual tile numbers\n - last (numCols * numRows) bytes are the tile types (wall, ladder,...)","params":[{"type":{"names":["any"]},"name":"buffer"}],"name":"setBuffer","longname":"Map#setBuffer","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#setBuffer"},{"comment":"/**\n     * Changes the easing function used when scrolling the viewport\n     *\n     * @param {String} easing='linear' The new easing function to use.\n     */","meta":{"range":[7044,7124],"filename":"Map.js","lineno":199,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100000508","name":"Map#setEasing","type":"MethodDefinition","paramnames":["easing"]},"vars":{"":null}},"description":"Changes the easing function used when scrolling the viewport","params":[{"type":{"names":["String"]},"defaultvalue":"'linear'","description":"The new easing function to use.","name":"easing"}],"name":"setEasing","longname":"Map#setEasing","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#setEasing"},{"comment":"/**\n\t * Sets the master object, it will be used for:\n\t *  - scrolling the viewport when needed, centering it around the master sprite\n\t *  - collision detection\n\t *\n\t * @param {Drawable} obj The object to set as master.\n\t *\n\t */","meta":{"range":[10812,11024],"filename":"Map.js","lineno":327,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100000968","name":"Map#setMasterObject","type":"MethodDefinition","paramnames":["obj"]},"vars":{"":null}},"description":"Sets the master object, it will be used for:\n - scrolling the viewport when needed, centering it around the master sprite\n - collision detection","params":[{"type":{"names":["Drawable"]},"description":"The object to set as master.","name":"obj"}],"name":"setMasterObject","longname":"Map#setMasterObject","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#setMasterObject"},{"comment":"/**\n    * Calculates and sets the object's next x position using its current x, vx and\n    * avoids tileTypes tiles (ie: walls, moving platforms)\n    *\n    * @param {Drawable} sprite The sprite to get next position of.\n    * @param {Number} tileTypes The tileType.\n    * @returns {Boolean} Returns true if the object hit the spcified tile, false otherwise\n    *\n    */","meta":{"range":[27672,29724],"filename":"Map.js","lineno":846,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100002456","name":"Map#setNextX","type":"MethodDefinition","paramnames":["sprite","tileTypes"]},"vars":{"":null}},"description":"Calculates and sets the object's next x position using its current x, vx and\navoids tileTypes tiles (ie: walls, moving platforms)","params":[{"type":{"names":["Drawable"]},"description":"The sprite to get next position of.","name":"sprite"},{"type":{"names":["Number"]},"description":"The tileType.","name":"tileTypes"}],"returns":[{"type":{"names":["Boolean"]},"description":"Returns true if the object hit the spcified tile, false otherwise"}],"name":"setNextX","longname":"Map#setNextX","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#setNextX"},{"comment":"/**\n    * WIP: Calculates and sets the object's next y position using its current y, vy and\n    * avoids tileTypes tiles (ie: walls, moving platforms)\n    *\n    * @param {Drawable} sprite\n    * @param {any} tileTypes\n    * @returns {Boolean} true if the object hit a tile, false otherwise\n    *\n    */","meta":{"range":[30036,30720],"filename":"Map.js","lineno":904,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100002708","name":"Map#setNextYTop","type":"MethodDefinition","paramnames":["sprite","tileTypes"]},"vars":{"":null}},"description":"WIP: Calculates and sets the object's next y position using its current y, vy and\navoids tileTypes tiles (ie: walls, moving platforms)","params":[{"type":{"names":["Drawable"]},"name":"sprite"},{"type":{"names":["any"]},"name":"tileTypes"}],"returns":[{"type":{"names":["Boolean"]},"description":"true if the object hit a tile, false otherwise"}],"name":"setNextYTop","longname":"Map#setNextYTop","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#setNextYTop"},{"comment":"/**\n     * saves a refrence to the scene the map is attached to\n     *\n     * @param {Scene} scene Reference to the scene the map is being attached to.\n     */","meta":{"range":[9663,9714],"filename":"Map.js","lineno":287,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100000843","name":"Map#setScene","type":"MethodDefinition","paramnames":["scene"]},"vars":{"":null}},"description":"saves a refrence to the scene the map is attached to","params":[{"type":{"names":["Scene"]},"description":"Reference to the scene the map is being attached to.","name":"scene"}],"name":"setScene","longname":"Map#setScene","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#setScene"},{"comment":"/**\n\t *\n\t * Changes the start position using the master's current position: usually called when reaching a checkpoint\n\t *\n\t */","meta":{"range":[6760,6876],"filename":"Map.js","lineno":189,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100000484","name":"Map#setStartXYFromMaster","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Changes the start position using the master's current position: usually called when reaching a checkpoint","name":"setStartXYFromMaster","longname":"Map#setStartXYFromMaster","kind":"function","memberof":"Map","scope":"instance","params":[],"$longname":"Map#setStartXYFromMaster"},{"comment":"/**\n\t * Sets the map tile size (in pixels)\n\t *\n\t * @param {number} width of a map tile.\n\t * @param {number} height of a map tile.\n\t *\n\t */","meta":{"range":[12720,12821],"filename":"Map.js","lineno":395,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100001122","name":"Map#setTilesSize","type":"MethodDefinition","paramnames":["width","height"]},"vars":{"":null}},"description":"Sets the map tile size (in pixels)","params":[{"type":{"names":["number"]},"description":"of a map tile.","name":"width"},{"type":{"names":["number"]},"description":"of a map tile.","name":"height"}],"name":"setTilesSize","longname":"Map#setTilesSize","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#setTilesSize"},{"comment":"/**\n\t * changes current viewport size and position\n\t *\n\t * @param {number} x Horizontal position of the viewport.\n\t * @param {number} y Vertical position of the viewport.\n\t * @param {number} width Width of the viewport.\n\t * @param {number} height Height of the viewport.\n\t *\n\t * @note there is currently no boundaries checks\n\t *\n\t */","meta":{"range":[13166,13327],"filename":"Map.js","lineno":412,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100001140","name":"Map#setViewPort","type":"MethodDefinition","paramnames":["x","y","width","height"]},"vars":{"":null}},"description":"changes current viewport size and position","params":[{"type":{"names":["number"]},"description":"Horizontal position of the viewport.","name":"x"},{"type":{"names":["number"]},"description":"Vertical position of the viewport.","name":"y"},{"type":{"names":["number"]},"description":"Width of the viewport.","name":"width"},{"type":{"names":["number"]},"description":"Height of the viewport.","name":"height"}],"tags":[{"originalTitle":"note","title":"note","text":"there is currently no boundaries checks","value":"there is currently no boundaries checks"}],"name":"setViewPort","longname":"Map#setViewPort","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#setViewPort"},{"comment":"/**\n     * shifts map from top to bottom\n     *\n     * @param {Number} startLine Where to start the copy.\n     * @param {Number} height How many lines to shift.\n     * @param {Number} tile Tile to use for new lines.\n     */","meta":{"range":[53755,54158],"filename":"Map.js","lineno":1627,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100004810","name":"Map#shift","type":"MethodDefinition","paramnames":["startLine","height","tile"]},"vars":{"":null}},"description":"shifts map from top to bottom","params":[{"type":{"names":["Number"]},"description":"Where to start the copy.","name":"startLine"},{"type":{"names":["Number"]},"description":"How many lines to shift.","name":"height"},{"type":{"names":["Number"]},"description":"Tile to use for new lines.","name":"tile"}],"name":"shift","longname":"Map#shift","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#shift"},{"comment":"/**\n\t * DEBUG: draw outline of each tile with a different color, depending\n\t * on the type of tile\n\t *\n\t * @param {CanvasContext} ctx The canvas context to render outline on.\n\t *\n\t */","meta":{"range":[48156,49900],"filename":"Map.js","lineno":1442,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100004214","name":"Map#showTileBehaviors","type":"MethodDefinition","paramnames":["ctx","showHidden","mapOffsetX","mapOffsetY"]},"vars":{"":null}},"description":"DEBUG: draw outline of each tile with a different color, depending\non the type of tile","params":[{"type":{"names":["CanvasContext"]},"description":"The canvas context to render outline on.","name":"ctx"}],"name":"showTileBehaviors","longname":"Map#showTileBehaviors","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#showTileBehaviors"},{"comment":"/**\n\t * Handle moving map & its objects:\n\t *  - updates the viewport window if map.moving is set\n\t *  - checks for triggers (that could spawn new objects onto the map)\n\t *  - move platforms and objects\n\t *\n     * @param {Number} timestamp current time\n\t */","meta":{"range":[14869,16141],"filename":"Map.js","lineno":473,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100001247","name":"Map#update","type":"MethodDefinition","paramnames":["timestamp"]},"vars":{"":null}},"description":"Handle moving map & its objects:\n - updates the viewport window if map.moving is set\n - checks for triggers (that could spawn new objects onto the map)\n - move platforms and objects","params":[{"type":{"names":["Number"]},"description":"current time","name":"timestamp"}],"name":"update","longname":"Map#update","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#update"},{"comment":"/**\n     * updates individual tile & tile behavior\n     *\n     * @param {Number} col The column of the tile to update.\n     * @param {Number} row The row of the tile to update.\n     * @param {Number} [tileNum=-1] The new tile number to use, the previous one will be kept if tileNum === -1.\n     * @param {Number} [behavior=-1] The new tile behavior, the previous value will be kept if behavior === -1.\n     *\n     */","meta":{"range":[53190,53521],"filename":"Map.js","lineno":1606,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100004746","name":"Map#updateTile","type":"MethodDefinition","paramnames":["col","row","tileNum","behavior"]},"vars":{"":null}},"description":"updates individual tile & tile behavior","params":[{"type":{"names":["Number"]},"description":"The column of the tile to update.","name":"col"},{"type":{"names":["Number"]},"description":"The row of the tile to update.","name":"row"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":-1,"description":"The new tile number to use, the previous one will be kept if tileNum === -1.","name":"tileNum"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":-1,"description":"The new tile behavior, the previous value will be kept if behavior === -1.","name":"behavior"}],"name":"updateTile","longname":"Map#updateTile","kind":"function","memberof":"Map","scope":"instance","$longname":"Map#updateTile"}],"$constructor":{"comment":"/**\n     * Creates a new Map\n     *\n     * @param {Object} options\n     * @param {String} options.src The url to an image that will be used for the tiles\n     * @param {Number} options.tileWidth The width of a tile\n     * @param {Number} options.tileHeight The height of a tile\n     * @param {Number} options.width The full width of the map\n     * @param {Number} options.height The full height of the map\n     * @param {Number} options.viewportW The width of the viewport: it is usually the same as the game width. Default = map.width\n     * @param {Number} options.viewportH The height of the viewport: it is usually the same as the game height. Default = map.height\n     * @param {Number} [options.viewportX=0] Initial x viewport (horizontal scrolling position) of the map.\n     * @param {Number} [options.viewportY=0] Initial y viewport (vertical scrolling position) of the map.\n     * @param {Array} [options.tiles] An optionnal array with the tiles to use for the map.\n     * @param {String} [options.name='map'] An optional name for the map.\n     * @param {String} [options.easing='linear'] The linear function to use when scrolling the map. Defaults to linear.\n     * @param {Number} [options.startX=0] The start x position of the master object.\n     * @param {Sumber} [options.startY=0] The start y position of the master object.\n     * @param {ArrayBuffer} options.buffer The buffer containing width \\* height bytes container tile numbers followed by width*height bytes for the tile behaviors\n     * @example\n     * // Creates a new 800x600 map, with a 320x200 viewport and 32x32 tiles\n     * var map = new Map({\n     *    src: 'mapTiles.jpg',\n     *    tileWidth: 32,\n     *    tileHeight: 32,\n     *    width: 800,\n     *    height: 600,\n     *    viewportW: 320,\n     *    viewportH: 200,\n     *    buffer: new ArrayBuffer(800*600*2),\n     * });\n     */","meta":{"range":[2418,6623],"filename":"Map.js","lineno":52,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100000031","name":"Map","type":"MethodDefinition","paramnames":["options"]},"vars":{"":null}},"description":"Creates a new Map","params":[{"type":{"names":["Object"]},"name":"options"},{"type":{"names":["String"]},"description":"The url to an image that will be used for the tiles","name":"options.src"},{"type":{"names":["Number"]},"description":"The width of a tile","name":"options.tileWidth"},{"type":{"names":["Number"]},"description":"The height of a tile","name":"options.tileHeight"},{"type":{"names":["Number"]},"description":"The full width of the map","name":"options.width"},{"type":{"names":["Number"]},"description":"The full height of the map","name":"options.height"},{"type":{"names":["Number"]},"description":"The width of the viewport: it is usually the same as the game width. Default = map.width","name":"options.viewportW"},{"type":{"names":["Number"]},"description":"The height of the viewport: it is usually the same as the game height. Default = map.height","name":"options.viewportH"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"Initial x viewport (horizontal scrolling position) of the map.","name":"options.viewportX"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"Initial y viewport (vertical scrolling position) of the map.","name":"options.viewportY"},{"type":{"names":["Array"]},"optional":true,"description":"An optionnal array with the tiles to use for the map.","name":"options.tiles"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"'map'","description":"An optional name for the map.","name":"options.name"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"'linear'","description":"The linear function to use when scrolling the map. Defaults to linear.","name":"options.easing"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"The start x position of the master object.","name":"options.startX"},{"type":{"names":["Sumber"]},"optional":true,"defaultvalue":0,"description":"The start y position of the master object.","name":"options.startY"},{"type":{"names":["ArrayBuffer"]},"description":"The buffer containing width \\* height bytes container tile numbers followed by width*height bytes for the tile behaviors","name":"options.buffer"}],"examples":["// Creates a new 800x600 map, with a 320x200 viewport and 32x32 tiles\nvar map = new Map({\n   src: 'mapTiles.jpg',\n   tileWidth: 32,\n   tileHeight: 32,\n   width: 800,\n   height: 600,\n   viewportW: 320,\n   viewportH: 200,\n   buffer: new ArrayBuffer(800*600*2),\n});"],"name":"Map","longname":"Map","kind":"class","scope":"global","undocumented":true,"$longname":"Map"}},{"comment":"/**\n * MapEvent handles events that are triggered on the map.\n * Such events can be: checkpoint was reached, new wave needs to\n * be generated, etc...\n *\n * For that, the MapEvent class stores a list of items, events, switches\n * that are on the map.\n *\n * This is a default MapEvent class: games should extend MapEvent\n * to handle whatever events they need.\n *\n */","meta":{"range":[451,6737],"filename":"MapEvent.js","lineno":16,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100005333","name":"MapEvent","type":"ClassDeclaration","paramnames":["map"]}},"classdesc":"MapEvent handles events that are triggered on the map.\nSuch events can be: checkpoint was reached, new wave needs to\nbe generated, etc...\n\nFor that, the MapEvent class stores a list of items, events, switches\nthat are on the map.\n\nThis is a default MapEvent class: games should extend MapEvent\nto handle whatever events they need.","name":"MapEvent","longname":"MapEvent","kind":"class","scope":"global","description":"Creates a new MapEvent","params":[{"type":{"names":["Map"]},"name":"map"}],"$longname":"MapEvent","$members":[{"comment":"/**\n     * Adds a new [`Drawable`]{#item} onto the map\n     *\n     * @param {String} id of the item to add\n     * @param {Drawable} item to add\n     */","meta":{"range":[1008,1064],"filename":"MapEvent.js","lineno":43,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100005382","name":"MapEvent#addItem","type":"MethodDefinition","paramnames":["id","item"]},"vars":{"":null}},"description":"Adds a new [`Drawable`]{#item} onto the map","params":[{"type":{"names":["String"]},"description":"of the item to add","name":"id"},{"type":{"names":["Drawable"]},"description":"to add","name":"item"}],"name":"addItem","longname":"MapEvent#addItem","kind":"function","memberof":"MapEvent","scope":"instance","$longname":"MapEvent#addItem"},{"comment":"/**\n     * checks of conditions of specified trigger are valid\n     *\n     * @param {Object} trigger The trigger to check.\n     *\n     * @returns {Boolean} true if the trigger is valid\n     */","meta":{"range":[2062,3023],"filename":"MapEvent.js","lineno":85,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100005461","name":"MapEvent#checkConditions","type":"MethodDefinition","paramnames":["trigger"]},"vars":{"":null}},"description":"checks of conditions of specified trigger are valid","params":[{"type":{"names":["Object"]},"description":"The trigger to check.","name":"trigger"}],"returns":[{"type":{"names":["Boolean"]},"description":"true if the trigger is valid"}],"name":"checkConditions","longname":"MapEvent#checkConditions","kind":"function","memberof":"MapEvent","scope":"instance","$longname":"MapEvent#checkConditions"},{"comment":"/**\n     * Returns an item\n     *\n     * @param {String} id of the item to retrieve\n     *\n     * @returns {Drawable|undefined} The item or undefined if it wasn't handled by the map\n     */","meta":{"range":[1264,1314],"filename":"MapEvent.js","lineno":54,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100005396","name":"MapEvent#getItem","type":"MethodDefinition","paramnames":["id"]},"vars":{"":null}},"description":"Returns an item","params":[{"type":{"names":["String"]},"description":"of the item to retrieve","name":"id"}],"returns":[{"type":{"names":["Drawable","undefined"]},"description":"The item or undefined if it wasn't handled by the map"}],"name":"getItem","longname":"MapEvent#getItem","kind":"function","memberof":"MapEvent","scope":"instance","$longname":"MapEvent#getItem"},{"comment":"/**\n     * Retrieves a switch from the map using its id\n     *\n     * @param {String} id The switch to retrieve.\n     *\n     * @returns {any} returns the switch or false if it could not be found\n     */","meta":{"range":[1795,1859],"filename":"MapEvent.js","lineno":74,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100005448","name":"MapEvent#getSwitch","type":"MethodDefinition","paramnames":["id"]},"vars":{"":null}},"description":"Retrieves a switch from the map using its id","params":[{"type":{"names":["String"]},"description":"The switch to retrieve.","name":"id"}],"returns":[{"type":{"names":["any"]},"description":"returns the switch or false if it could not be found"}],"name":"getSwitch","longname":"MapEvent#getSwitch","kind":"function","memberof":"MapEvent","scope":"instance","$longname":"MapEvent#getSwitch"},{"comment":"/**\n     * Add a new wave of objects to the map\n\t * Used for example when the player triggers apparition of several enemies or bonuses\n     *\n     * @param {Object} options The options to pass to the wav object\n     * @returns {Boolean}\n     *\n\t * @related {Wave}\n     */","meta":{"range":[5979,6396],"filename":"MapEvent.js","lineno":213,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100005737","name":"MapEvent#handleWave","type":"MethodDefinition","paramnames":["options"]},"vars":{"":null}},"description":"Add a new wave of objects to the map\nUsed for example when the player triggers apparition of several enemies or bonuses","params":[{"type":{"names":["Object"]},"description":"The options to pass to the wav object","name":"options"}],"returns":[{"type":{"names":["Boolean"]}}],"tags":[{"originalTitle":"related","title":"related","text":"{Wave}","value":"{Wave}"}],"name":"handleWave","longname":"MapEvent#handleWave","kind":"function","memberof":"MapEvent","scope":"instance","$longname":"MapEvent#handleWave"},{"comment":"/**\n     * Resets the MapEvent switches, events and items\n     */","meta":{"range":[752,846],"filename":"MapEvent.js","lineno":31,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100005360","name":"MapEvent#reset","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Resets the MapEvent switches, events and items","name":"reset","longname":"MapEvent#reset","kind":"function","memberof":"MapEvent","scope":"instance","params":[],"$longname":"MapEvent#reset"},{"comment":"/**\n     * Schedule adding a new object to the map\n     *\n     * @param {String} spriteId The id of the new sprite to add.\n     * @param {Object} spriteOptions The options that will be passed to the object constructor.\n     * @param {Number} [delay=0] The delay in milliseconds to wait before adding the object.\n     * @returns {Drawable} the new drawable\n     *\n     */","meta":{"range":[5132,5696],"filename":"MapEvent.js","lineno":186,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100005693","name":"MapEvent#scheduleSprite","type":"MethodDefinition","paramnames":["spriteId","spriteOptions","delay"]},"vars":{"":null}},"description":"Schedule adding a new object to the map","params":[{"type":{"names":["String"]},"description":"The id of the new sprite to add.","name":"spriteId"},{"type":{"names":["Object"]},"description":"The options that will be passed to the object constructor.","name":"spriteOptions"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"The delay in milliseconds to wait before adding the object.","name":"delay"}],"returns":[{"type":{"names":["Drawable"]},"description":"the new drawable"}],"name":"scheduleSprite","longname":"MapEvent#scheduleSprite","kind":"function","memberof":"MapEvent","scope":"instance","$longname":"MapEvent#scheduleSprite"}],"$constructor":{"comment":"/**\n     * Creates a new MapEvent\n     *\n     * @param {Map} map\n     */","meta":{"range":[549,676],"filename":"MapEvent.js","lineno":22,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100005336","name":"MapEvent","type":"MethodDefinition","paramnames":["map"]},"vars":{"":null}},"description":"Creates a new MapEvent","params":[{"type":{"names":["Map"]},"name":"map"}],"name":"MapEvent","longname":"MapEvent","kind":"class","scope":"global","undocumented":true,"$longname":"MapEvent"}},{"comment":"/**\n * Class that describes a tile\n * \n * @param {Object} options\n * @param {Number} [options.offsetX=0] The horizontal offset of the tile in the tilesheet.\n * @param {Number} [options.offsetY=0] The vertical offset of the tile in the tilesheet.\n * @param {Number} [options.width=16] The tile width in pixels.\n * @param {Number} [options.height=16] The tile height in pixels.\n */","meta":{"range":[380,1196],"filename":"Tile.js","lineno":10,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100005836","name":"Tile","type":"ClassDeclaration","paramnames":["options"]}},"classdesc":"Class that describes a tile","params":[{"type":{"names":["Object"]},"name":"options"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"The horizontal offset of the tile in the tilesheet.","name":"options.offsetX"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"The vertical offset of the tile in the tilesheet.","name":"options.offsetY"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":16,"description":"The tile width in pixels.","name":"options.width"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":16,"description":"The tile height in pixels.","name":"options.height"}],"name":"Tile","longname":"Tile","kind":"class","scope":"global","description":"Creates a new Tile","$longname":"Tile","$members":[{"comment":"/**\n     * Static tile behaviors\n     */","meta":{"range":[1078,1194],"filename":"Tile.js","lineno":30,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100005914","name":"Tile.TYPE","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Static tile behaviors","name":"TYPE","longname":"Tile.TYPE","kind":"member","memberof":"Tile","scope":"static","params":[],"$longname":"Tile.TYPE"}],"$constructor":{"comment":"/**\n     * Creates a new Tile\n     */","meta":{"range":[439,1027],"filename":"Tile.js","lineno":14,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Map","code":{"id":"astnode100005839","name":"Tile","type":"MethodDefinition","paramnames":["options"]},"vars":{"":null}},"description":"Creates a new Tile","name":"Tile","longname":"Tile","kind":"class","scope":"global","params":[],"undocumented":true,"$longname":"Tile"}}],"symbols":["Map","Map#addObject","Map#addTileSet","Map#checkCollisions","Map#checkForTileType","Map#checkForTriggers","Map#checkMasterBulletsToEnemiesCollisions","Map#checkMasterPosition","Map#checkMasterToEnemiesCollisions","Map#checkMatrixForCollision","Map#clear","Map#debug","Map#fallTest","Map#getMaxDistanceToTile","Map#getTileAt","Map#getTileBehaviorAtIndex","Map#getTileIndexFromPixel","Map#getTilePixelPos","Map#hitObjectTest","Map#moveObjects","Map#movePlatforms","Map#moveTo","Map#notify","Map#removeObject","Map#reset","Map#respawn","Map#setBuffer","Map#setEasing","Map#setMasterObject","Map#setNextX","Map#setNextYTop","Map#setScene","Map#setStartXYFromMaster","Map#setTilesSize","Map#setViewPort","Map#shift","Map#showTileBehaviors","Map#update","Map#updateTile","MapEvent","MapEvent#addItem","MapEvent#checkConditions","MapEvent#getItem","MapEvent#getSwitch","MapEvent#handleWave","MapEvent#reset","MapEvent#scheduleSprite","Tile","Tile.TYPE"]},"input":{"documentation":[{"comment":"/**\n * Handles keyboard input (joystick input doesn't work correctly yet).\n *\n * Key presses are stored in a simple hash this.keyPressed with keyCode as key, and attached handlers are stored in\n * another hash this.keyCb.\n *\n * The InputManager can also be used to record keystrokes which can then be played back to produce game demos for example.\n *\n * @example\n *\n * // example state of InputManager.keyPressed where `up` key is down and `down` key has just been released:\n * { 32: true, 40: false}\n *\n */","meta":{"range":[617,19796],"filename":"InputManager.js","lineno":19,"columnno":6,"path":"E:\\Docs\\Dev\\athenajs\\js\\Input","code":{"id":"astnode100000003","name":"InputManager","type":"ObjectExpression","value":"{\"KEYS\":\"\",\"PAD_BUTTONS\":\"\",\"axes\":\"\",\"newGamepadPollDelay\":1000,\"gamepadSupport\":false,\"recording\":false,\"playingEvents\":false,\"playingPos\":0,\"recordedEvents\":\"\",\"pad\":null,\"latches\":\"\",\"keyPressed\":\"\",\"padPressed\":\"\",\"keyCb\":\"\",\"enabled\":true,\"inputMode\":\"keyboard\",\"dPadJoystick\":null,\"jPollInterval\":0,\"init\":\"\",\"_generateKeyCodes\":\"\",\"_installInputModeSwitchHandler\":\"\",\"startRecordingEvents\":\"\",\"stopRecordingEvents\":\"\",\"playRecordedEvents\":\"\",\"nextRecordedEvents\":\"\",\"recordEvents\":\"\",\"setInputMode\":\"\",\"_resetKeys\":\"\",\"_pollNewGamepad\":\"\",\"_pollGamepad\":\"\",\"_getModifiers\":\"\",\"_initVirtualJoystick\":\"\",\"_clearJoystickPoll\":\"\",\"_pollJoystick\":\"\",\"_installKBEventHandlers\":\"\",\"getAllKeysStatus\":\"\",\"getKeyStatus\":\"\",\"isKeyDown\":\"\",\"installKeyCallback\":\"\",\"removeKeyCallback\":\"\",\"clearEvents\":\"\"}"}},"description":"Handles keyboard input (joystick input doesn't work correctly yet).\n\nKey presses are stored in a simple hash this.keyPressed with keyCode as key, and attached handlers are stored in\nanother hash this.keyCb.\n\nThe InputManager can also be used to record keystrokes which can then be played back to produce game demos for example.","examples":["// example state of InputManager.keyPressed where `up` key is down and `down` key has just been released:\n{ 32: true, 40: false}"],"name":"InputManager","longname":"InputManager","kind":"constant","scope":"global","params":[],"$longname":"InputManager","$members":[{"comment":"/**\n     * Returns an object with the state of all keys\n     */","meta":{"range":[17990,18238],"filename":"InputManager.js","lineno":537,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Input","code":{"id":"astnode100001591","name":"getAllKeysStatus","type":"FunctionExpression"},"vars":{"keys":"InputManager.getAllKeysStatus~keys","result":"InputManager.getAllKeysStatus~result","i":"InputManager.getAllKeysStatus~i","result[undefined]":"InputManager.getAllKeysStatus~result.undefined]"}},"description":"Returns an object with the state of all keys","name":"getAllKeysStatus","longname":"InputManager.getAllKeysStatus","kind":"function","memberof":"InputManager","scope":"static","$longname":"InputManager.getAllKeysStatus"},{"comment":"/**\n     * Initializes the InputManager with a reference to the game.\n     *\n     * This method prepares the InputManager by reseting keyboard states/handlers and\n     * set current inputMode\n     *\n     * @param {Object} options List of input options, unused for now\n     *\n     */","meta":{"range":[2303,2580],"filename":"InputManager.js","lineno":83,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Input","code":{"id":"astnode100000090","name":"init","type":"FunctionExpression"}},"description":"Initializes the InputManager with a reference to the game.\n\nThis method prepares the InputManager by reseting keyboard states/handlers and\nset current inputMode","params":[{"type":{"names":["Object"]},"description":"List of input options, unused for now","name":"options"}],"name":"init","longname":"InputManager.init","kind":"function","memberof":"InputManager","scope":"static","$longname":"InputManager.init"},{"comment":"/**\n     * Install callback that gets called when a key is pressed/released\n     *\n     * @param {String} key space-separated list of keys to listen for\n     * @param {String} event to listen for: can be `up` or `down`\n     * @param {Function} callback the function to call\n     */","meta":{"range":[19102,19482],"filename":"InputManager.js","lineno":579,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Input","code":{"id":"astnode100001715","name":"installKeyCallback","type":"FunctionExpression"},"vars":{"":null}},"description":"Install callback that gets called when a key is pressed/released","params":[{"type":{"names":["String"]},"description":"space-separated list of keys to listen for","name":"key"},{"type":{"names":["String"]},"description":"to listen for: can be `up` or `down`","name":"event"},{"type":{"names":["function"]},"description":"the function to call","name":"callback"}],"name":"installKeyCallback","longname":"InputManager.installKeyCallback","kind":"function","memberof":"InputManager","scope":"static","$longname":"InputManager.installKeyCallback"},{"comment":"/**\n     * A list of common keyCodes\n     */","meta":{"range":[687,862],"filename":"InputManager.js","lineno":23,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Input","code":{"id":"astnode100000006","name":"KEYS","type":"ObjectExpression","value":"{\"undefined\":17}"}},"description":"A list of common keyCodes","name":"KEYS","longname":"InputManager.KEYS","kind":"member","memberof":"InputManager","scope":"static","$longname":"InputManager.KEYS"},{"comment":"/**\n     * Sets next key states using recorded events\n     *\n     * TODO: add an optional callback to be called at the end of the playback\n     * so that demo can be looped.\n     */","meta":{"range":[5075,6044],"filename":"InputManager.js","lineno":161,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Input","code":{"id":"astnode100000241","name":"nextRecordedEvents","type":"FunctionExpression"},"vars":{"this.playingEvents":"InputManager.nextRecordedEvents#playingEvents","this.keyPressed":"InputManager.nextRecordedEvents#keyPressed"}},"description":"Sets next key states using recorded events\n\nTODO: add an optional callback to be called at the end of the playback\nso that demo can be looped.","name":"nextRecordedEvents","longname":"InputManager.nextRecordedEvents","kind":"function","memberof":"InputManager","scope":"static","$longname":"InputManager.nextRecordedEvents"},{"comment":"/**\n     * List of common pad buttons\n     */","meta":{"range":[918,1437],"filename":"InputManager.js","lineno":36,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Input","code":{"id":"astnode100000024","name":"PAD_BUTTONS","type":"ObjectExpression","value":"{\"undefined\":15,\"FACE_0\":1,\"FACE_3\":2,\"FACE_4\":3,\"LEFT_SHOULDER\":4,\"RIGHT_SHOULDER\":5,\"LEFT_SHOULDER_BOTTOM\":6,\"RIGHT_SHOULDER_BOTTOM\":7,\"SELECT\":8,\"START\":9,\"LEFT_ANALOGUE_STICK\":10,\"RIGHT_ANALOGUE_STICK\":11}"}},"description":"List of common pad buttons","name":"PAD_BUTTONS","longname":"InputManager.PAD_BUTTONS","kind":"member","memberof":"InputManager","scope":"static","$longname":"InputManager.PAD_BUTTONS"},{"comment":"/**\n     * After events have been reccorded they can be played back using this method.\n     */","meta":{"range":[4634,4883],"filename":"InputManager.js","lineno":148,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Input","code":{"id":"astnode100000214","name":"playRecordedEvents","type":"FunctionExpression"},"vars":{"this.playingEvents":"InputManager.playRecordedEvents#playingEvents","this.playPos":"InputManager.playRecordedEvents#playPos"}},"description":"After events have been reccorded they can be played back using this method.","name":"playRecordedEvents","longname":"InputManager.playRecordedEvents","kind":"function","memberof":"InputManager","scope":"static","$longname":"InputManager.playRecordedEvents"},{"comment":"/**\n     * Changes input mode\n     *\n     * @param {String} mode Changes current input mode, can be `virtual_joystick`, `keyboard`, `gamepad`\n     */","meta":{"range":[6686,7547],"filename":"InputManager.js","lineno":208,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Input","code":{"id":"astnode100000324","name":"setInputMode","type":"FunctionExpression"},"vars":{"this.jPollInterval":"InputManager.setInputMode#jPollInterval","this.inputMode":"InputManager.setInputMode#inputMode"}},"description":"Changes input mode","params":[{"type":{"names":["String"]},"description":"Changes current input mode, can be `virtual_joystick`, `keyboard`, `gamepad`","name":"mode"}],"name":"setInputMode","longname":"InputManager.setInputMode","kind":"function","memberof":"InputManager","scope":"static","$longname":"InputManager.setInputMode"},{"comment":"/**\n     * Starts recording input events. They are stored into `InputManager.recordedEvents`\n     */","meta":{"range":[4049,4286],"filename":"InputManager.js","lineno":131,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Input","code":{"id":"astnode100000164","name":"startRecordingEvents","type":"FunctionExpression"},"vars":{"this.recordedEvents.length":"InputManager.startRecordingEvents#recordedEvents.length","this.recording":"InputManager.startRecordingEvents#recording"}},"description":"Starts recording input events. They are stored into `InputManager.recordedEvents`","name":"startRecordingEvents","longname":"InputManager.startRecordingEvents","kind":"function","memberof":"InputManager","scope":"static","$longname":"InputManager.startRecordingEvents"},{"comment":"/**\n     * Stops recording events.\n     */","meta":{"range":[4339,4529],"filename":"InputManager.js","lineno":141,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Input","code":{"id":"astnode100000193","name":"stopRecordingEvents","type":"FunctionExpression"},"vars":{"this.recording":"InputManager.stopRecordingEvents#recording"}},"description":"Stops recording events.","name":"stopRecordingEvents","longname":"InputManager.stopRecordingEvents","kind":"function","memberof":"InputManager","scope":"static","$longname":"InputManager.stopRecordingEvents"}]}],"symbols":["InputManager","InputManager.getAllKeysStatus","InputManager.init","InputManager.installKeyCallback","InputManager.KEYS","InputManager.nextRecordedEvents","InputManager.PAD_BUTTONS","InputManager.playRecordedEvents","InputManager.setInputMode","InputManager.startRecordingEvents","InputManager.stopRecordingEvents"]},"audio":{"documentation":[{"comment":"/**\n * `AudioManager` handles playback of audio files loaded using the `ResourceManager`\n *\n * @property {Object} audioCache An hash that stores in-use sounds.\n * The key is the id of the sound.\n * @property {Boolean} enabled This is set to false when sound playback is disabled.\n */","meta":{"range":[290,2662],"filename":"AudioManager.js","lineno":8,"columnno":6,"path":"E:\\Docs\\Dev\\athenajs\\js\\Audio","code":{"id":"astnode100000003","name":"AudioManager","type":"ObjectExpression","value":"{\"audioCache\":\"\",\"enabled\":true,\"addSound\":\"\",\"toggleSound\":\"\",\"play\":\"\",\"stop\":\"\"}"}},"description":"`AudioManager` handles playback of audio files loaded using the `ResourceManager`","properties":[{"type":{"names":["Object"]},"description":"An hash that stores in-use sounds.\nThe key is the id of the sound.","name":"audioCache"},{"type":{"names":["Boolean"]},"description":"This is set to false when sound playback is disabled.","name":"enabled"}],"name":"AudioManager","longname":"AudioManager","kind":"constant","scope":"global","params":[],"$longname":"AudioManager","$members":[{"comment":"/**\n     * Adds a new sound element to the audio cache.\n     * *Note* if a sound with the same id has already been added, it will be replaced\n     * by the new one.\n     *\n     * @param {String} id\n     * @param {HTMLAudioElement} element\n     */","meta":{"range":[601,680],"filename":"AudioManager.js","lineno":19,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Audio","code":{"id":"astnode100000010","name":"addSound","type":"FunctionExpression"},"vars":{"this.audioCache[undefined]":"AudioManager.addSound#audioCache[undefined]"}},"description":"Adds a new sound element to the audio cache.\n*Note* if a sound with the same id has already been added, it will be replaced\nby the new one.","params":[{"type":{"names":["String"]},"name":"id"},{"type":{"names":["HTMLAudioElement"]},"name":"element"}],"name":"addSound","longname":"AudioManager.addSound","kind":"function","memberof":"AudioManager","scope":"static","$longname":"AudioManager.addSound"},{"comment":"/**\n     * Plays the specified sound with `id`.\n     *\n     * @param {String} id The id of the sound to play.\n     * @param {Boolean} [loop=false] Set to true to have the sound playback loop.\n     * @param {Number} [volume=1] a Number between 0 and 1.\n     * @param {Number} [panning=0] a Number between 10 (left) and -10 (right).\n     * @returns {Wad} the created sound instance\n     */","meta":{"range":[1284,1970],"filename":"AudioManager.js","lineno":39,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Audio","code":{"id":"astnode100000033","name":"play","type":"FunctionExpression"},"vars":{"instance":"AudioManager.play~instance","sound":"AudioManager.play~sound","sound.loop":"AudioManager.play~sound.loop"}},"description":"Plays the specified sound with `id`.","params":[{"type":{"names":["String"]},"description":"The id of the sound to play.","name":"id"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"Set to true to have the sound playback loop.","name":"loop"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":1,"description":"a Number between 0 and 1.","name":"volume"},{"type":{"names":["Number"]},"optional":true,"defaultvalue":0,"description":"a Number between 10 (left) and -10 (right).","name":"panning"}],"returns":[{"type":{"names":["Wad"]},"description":"the created sound instance"}],"name":"play","longname":"AudioManager.play","kind":"function","memberof":"AudioManager","scope":"static","$longname":"AudioManager.play"},{"comment":"/**\n     * Stops playing the sound id\n     *\n     * @param {String} id The id of the sound to stop playing.\n     * @param {any} instanceId The instanceId to use, in case several sounds with the same Id are being played.\n     *\n     * @returns {undefined}\n     */","meta":{"range":[2243,2660],"filename":"AudioManager.js","lineno":76,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Audio","code":{"id":"astnode100000126","name":"stop","type":"FunctionExpression"},"vars":{"sound":"AudioManager.stop~sound"}},"description":"Stops playing the sound id","params":[{"type":{"names":["String"]},"description":"The id of the sound to stop playing.","name":"id"},{"type":{"names":["any"]},"description":"The instanceId to use, in case several sounds with the same Id are being played.","name":"instanceId"}],"returns":[{"type":{"names":["undefined"]}}],"name":"stop","longname":"AudioManager.stop","kind":"function","memberof":"AudioManager","scope":"static","$longname":"AudioManager.stop"},{"comment":"/**\n     * Toggles global sound playback\n     *\n     * @param {Boolean} bool whether to enabled or disable sound playback.\n     */","meta":{"range":[821,886],"filename":"AudioManager.js","lineno":27,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Audio","code":{"id":"astnode100000023","name":"toggleSound","type":"FunctionExpression"},"vars":{"this.enabled":"AudioManager.toggleSound#enabled"}},"description":"Toggles global sound playback","params":[{"type":{"names":["Boolean"]},"description":"whether to enabled or disable sound playback.","name":"bool"}],"name":"toggleSound","longname":"AudioManager.toggleSound","kind":"function","memberof":"AudioManager","scope":"static","$longname":"AudioManager.toggleSound"}]}],"symbols":["AudioManager","AudioManager.addSound","AudioManager.play","AudioManager.stop","AudioManager.toggleSound"]},"resource":{"documentation":[{"comment":"/**\n * Handles resource loading at runtime\n *\n * Resources are loaded and retrieved using this manager.\n *\n * The ResourceManager can load at runtime the following types of resources:\n *  - Images\n *  - Sounds\n *  - Maps (JSON-based)\n *\n */","meta":{"range":[874,21501],"filename":"ResourceManager.js","lineno":28,"columnno":6,"path":"E:\\Docs\\Dev\\athenajs\\js\\Resource","code":{"id":"astnode100000058","name":"ResourceManager","type":"ObjectExpression","value":"{\"isLocal\":\"\",\"scriptMaxTime\":3000,\"groupMaxTime\":5000,\"resources\":\"\",\"dynamicScripts\":\"\",\"iOS\":\"\",\"skipResources\":\"\",\"async\":true,\"loading\":false,\"getResourceById\":\"\",\"newResourceFromPool\":\"\",\"_createGroup\":\"\",\"_groupExists\":\"\",\"addResources\":\"\",\"loadNextResource\":\"\",\"loadResources\":\"\",\"getCanvasFromImage\":\"\",\"loadImage\":\"\",\"createObjectPool\":\"\",\"registerScript\":\"\",\"loadScript\":\"\",\"loadAudio\":\"\",\"loadWadAudio\":\"\",\"loadJSON\":\"\",\"loadMapData\":\"\",\"_resLoaded\":\"\",\"_loadResource\":\"\"}"}},"description":"Handles resource loading at runtime\n\nResources are loaded and retrieved using this manager.\n\nThe ResourceManager can load at runtime the following types of resources:\n - Images\n - Sounds\n - Maps (JSON-based)","name":"ResourceManager","longname":"ResourceManager","kind":"constant","scope":"global","params":[],"$longname":"ResourceManager","$members":[{"comment":"/**\n     * Add new resource(s) into the specified group\n     *\n     * @param {Object|Array} resource a single or a group of resources to load\n     * @param {String} [group='any'] the name of the group to add the resources into\n     *\n     * @returns {Deferred} a new Deferred that will be resolved once the\n     * resources have been loaded.\n     *\n     * *Note* This method only adds the resources to the group\n     * but do not load them.\n     *\n     * @example\n     *\n     * ResourceManager.addResources({\n     *  id: 'sprites',\n     *  type: 'image',\n     *  src: './sprites/gem.png'\n     * }, \"sprites\");\n     *\n     * // resource type can be image|map|audio\n     */","meta":{"range":[5547,6862],"filename":"ResourceManager.js","lineno":167,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Resource","code":{"id":"astnode100000295","name":"addResources","type":"FunctionExpression"},"vars":{"group":"ResourceManager.addResources~group","i":"ResourceManager.addResources~i","resGroup":"ResourceManager.addResources~resGroup","resGroup.res[undefined]":"ResourceManager.addResources~resGroup.res[undefined]"}},"description":"Add new resource(s) into the specified group","params":[{"type":{"names":["Object","Array"]},"description":"a single or a group of resources to load","name":"resource"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"'any'","description":"the name of the group to add the resources into","name":"group"}],"returns":[{"type":{"names":["Deferred"]},"description":"a new Deferred that will be resolved once the\nresources have been loaded.\n\n*Note* This method only adds the resources to the group\nbut do not load them."}],"examples":["ResourceManager.addResources({\n id: 'sprites',\n type: 'image',\n src: './sprites/gem.png'\n}, \"sprites\");\n\n// resource type can be image|map|audio"],"name":"addResources","longname":"ResourceManager.addResources","kind":"function","memberof":"ResourceManager","scope":"static","$longname":"ResourceManager.addResources"},{"comment":"/**\n     * Creates a pool for a specified object\n     *\n     * This method pre-allocates objects for later use.\n     *\n     * @param {Function} Obj a new object to create\n     * @param {Number} size the size of the pool\n     *\n     */","meta":{"range":[12483,12561],"filename":"ResourceManager.js","lineno":356,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Resource","code":{"id":"astnode100000936","name":"createObjectPool","type":"FunctionExpression"}},"description":"Creates a pool for a specified object\n\nThis method pre-allocates objects for later use.","params":[{"type":{"names":["function"]},"description":"a new object to create","name":"Obj"},{"type":{"names":["Number"]},"description":"the size of the pool","name":"size"}],"name":"createObjectPool","longname":"ResourceManager.createObjectPool","kind":"function","memberof":"ResourceManager","scope":"static","$longname":"ResourceManager.createObjectPool"},{"comment":"/**\n     * Retrieve a resource using its id with optionnal group\n     *\n     * @param {String} id The id of the resource to get\n     * @param {String} [group=\"any\"] the group to get the resource from\n     * @param {Boolean} [fullObject=false] returns the resource object if true. Otherwise return the resource only.\n     */","meta":{"range":[2014,2766],"filename":"ResourceManager.js","lineno":62,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Resource","code":{"id":"astnode100000113","name":"getResourceById","type":"FunctionExpression"},"vars":{"rsGroup":"ResourceManager.getResourceById~rsGroup","rs":"ResourceManager.getResourceById~rs"}},"description":"Retrieve a resource using its id with optionnal group","params":[{"type":{"names":["String"]},"description":"The id of the resource to get","name":"id"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"any\"","description":"the group to get the resource from","name":"group"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"returns the resource object if true. Otherwise return the resource only.","name":"fullObject"}],"name":"getResourceById","longname":"ResourceManager.getResourceById","kind":"function","memberof":"ResourceManager","scope":"static","$longname":"ResourceManager.getResourceById"},{"comment":"/**\n     * Loads a new Audio file using standard HTML5 Audio\n     *\n     * @param {Object} res a descriptor for the sound to load\n     * @param {String} gpName the name of the group to load the audio file from\n     *\n     * @returns {Deferred} a new promise that will be resolved once the file has been loaded\n     */","meta":{"range":[15670,16648],"filename":"ResourceManager.js","lineno":447,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Resource","code":{"id":"astnode100001022","name":"loadAudio","type":"FunctionExpression"},"vars":{"that":"ResourceManager.loadAudio~that","audio":"ResourceManager.loadAudio~audio","def":"ResourceManager.loadAudio~def","onLoad":"ResourceManager.loadAudio~onLoad","audio.preload":"ResourceManager.loadAudio~audio.preload","":null,"audio.src":"ResourceManager.loadAudio~audio.src"}},"description":"Loads a new Audio file using standard HTML5 Audio","params":[{"type":{"names":["Object"]},"description":"a descriptor for the sound to load","name":"res"},{"type":{"names":["String"]},"description":"the name of the group to load the audio file from","name":"gpName"}],"returns":[{"type":{"names":["Deferred"]},"description":"a new promise that will be resolved once the file has been loaded"}],"name":"loadAudio","longname":"ResourceManager.loadAudio","kind":"function","memberof":"ResourceManager","scope":"static","$longname":"ResourceManager.loadAudio"},{"comment":"/**\n     * starts loading an image\n     *\n     * @param {Object} res an Object describing the resource to load\n     * @param {String} [gpName=undefined] the name of the group that the resource came from, set to undefined to load a single resource\n     *\n     * @returns {Deferred} a new promise that will be resolved when the file has been loaded.\n     */","meta":{"range":[11257,12238],"filename":"ResourceManager.js","lineno":319,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Resource","code":{"id":"astnode100000852","name":"loadImage","type":"FunctionExpression"},"vars":{"img":"ResourceManager.loadImage~img","that":"ResourceManager.loadImage~that","def":"ResourceManager.loadImage~def","img.onload":"ResourceManager.loadImage~img.onload","":null,"img.src":"ResourceManager.loadImage~img.src"}},"description":"starts loading an image","params":[{"type":{"names":["Object"]},"description":"an Object describing the resource to load","name":"res"},{"type":{"names":["String"]},"optional":true,"description":"the name of the group that the resource came from, set to undefined to load a single resource","name":"gpName"}],"returns":[{"type":{"names":["Deferred"]},"description":"a new promise that will be resolved when the file has been loaded."}],"name":"loadImage","longname":"ResourceManager.loadImage","kind":"function","memberof":"ResourceManager","scope":"static","$longname":"ResourceManager.loadImage"},{"comment":"/**\n     * Loads a JSON file\n     *\n     * @param {Object} res The JSON file descriptor\n     * @param {String} gpName The name of the group to load the file from\n     * @param {Function} callback An optionnal callback to execute once the file has been loaded\n     *\n     * @returns {Deferred} a promise that will be resolved once the file has been loaded.\n     */","meta":{"range":[17793,18588],"filename":"ResourceManager.js","lineno":511,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Resource","code":{"id":"astnode100001183","name":"loadJSON","type":"FunctionExpression"},"vars":{"def":"ResourceManager.loadJSON~def","":null}},"description":"Loads a JSON file","params":[{"type":{"names":["Object"]},"description":"The JSON file descriptor","name":"res"},{"type":{"names":["String"]},"description":"The name of the group to load the file from","name":"gpName"},{"type":{"names":["function"]},"description":"An optionnal callback to execute once the file has been loaded","name":"callback"}],"returns":[{"type":{"names":["Deferred"]},"description":"a promise that will be resolved once the file has been loaded."}],"name":"loadJSON","longname":"ResourceManager.loadJSON","kind":"function","memberof":"ResourceManager","scope":"static","$longname":"ResourceManager.loadJSON"},{"comment":"/**\n     * Attempts to load the next resource in the specified group\n     *\n     * @param {String} groupName the name of the group to use.\n     */","meta":{"range":[7019,7363],"filename":"ResourceManager.js","lineno":203,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Resource","code":{"id":"astnode100000474","name":"loadNextResource","type":"FunctionExpression"},"vars":{"group":"ResourceManager.loadNextResource~group","i":"ResourceManager.loadNextResource~i"}},"description":"Attempts to load the next resource in the specified group","params":[{"type":{"names":["String"]},"description":"the name of the group to use.","name":"groupName"}],"name":"loadNextResource","longname":"ResourceManager.loadNextResource","kind":"function","memberof":"ResourceManager","scope":"static","$longname":"ResourceManager.loadNextResource"},{"comment":"/**\n     * Loads all resources found in the specified group, optionnaly\n     * calling a callback after each file has been loaded.\n     *\n     * @param {String} group The name of the group to load.\n     * @param {Function} [progressCb=undefined] an optionnal progress callback.\n     * @param {Function} [errorCb=undefined] an optionnal error callback.\n     *\n     */","meta":{"range":[7809,10400],"filename":"ResourceManager.js","lineno":224,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Resource","code":{"id":"astnode100000533","name":"loadResources","type":"FunctionExpression"},"vars":{"group":"ResourceManager.loadResources~group","this.loading":"ResourceManager.loadResources#loading","resGroup":"ResourceManager.loadResources~resGroup","nextRes":"ResourceManager.loadResources~nextRes","i":"ResourceManager.loadResources~i","size":"ResourceManager.loadResources~size","resGroup.progressCb":"ResourceManager.loadResources~resGroup.progressCb","resGroup.errorCb":"ResourceManager.loadResources~resGroup.errorCb","resGroup.gpTimeout":"ResourceManager.loadResources~resGroup.gpTimeout","":null}},"description":"Loads all resources found in the specified group, optionnaly\ncalling a callback after each file has been loaded.","params":[{"type":{"names":["String"]},"description":"The name of the group to load.","name":"group"},{"type":{"names":["function"]},"optional":true,"description":"an optionnal progress callback.","name":"progressCb"},{"type":{"names":["function"]},"optional":true,"description":"an optionnal error callback.","name":"errorCb"}],"name":"loadResources","longname":"ResourceManager.loadResources","kind":"function","memberof":"ResourceManager","scope":"static","$longname":"ResourceManager.loadResources"},{"comment":"/**\n     * Loads a new Audio file using the WAD library\n     *\n     * @param {Object} res a descriptor for the sound to load\n     * @param {String} gpName the name of the group to load the audio file from\n     *\n     * @returns {Deferred} a new promise that will be resolved once the file has been loaded\n     */","meta":{"range":[16972,17418],"filename":"ResourceManager.js","lineno":486,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Resource","code":{"id":"astnode100001124","name":"loadWadAudio","type":"FunctionExpression"},"vars":{"def":"ResourceManager.loadWadAudio~def","sound":"ResourceManager.loadWadAudio~sound","":null}},"description":"Loads a new Audio file using the WAD library","params":[{"type":{"names":["Object"]},"description":"a descriptor for the sound to load","name":"res"},{"type":{"names":["String"]},"description":"the name of the group to load the audio file from","name":"gpName"}],"returns":[{"type":{"names":["Deferred"]},"description":"a new promise that will be resolved once the file has been loaded"}],"name":"loadWadAudio","longname":"ResourceManager.loadWadAudio","kind":"function","memberof":"ResourceManager","scope":"static","$longname":"ResourceManager.loadWadAudio"},{"comment":"/**\n     * Allocates a new resource from the pool\n     *\n     * This method creates a new instance of the JavaScript object, retrieving it from\n     * the pool if the object supports it. If it does not it simply uses new to generate a new instance\n     *\n     * @param {String} id The id of the resource for which to create a new instance.\n     *\n     * @returns {Object} a new instance of the specified object.\n     */","meta":{"range":[3196,3716],"filename":"ResourceManager.js","lineno":95,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Resource","code":{"id":"astnode100000177","name":"newResourceFromPool","type":"FunctionExpression"},"vars":{"resource":"ResourceManager.newResourceFromPool~resource"}},"description":"Allocates a new resource from the pool\n\nThis method creates a new instance of the JavaScript object, retrieving it from\nthe pool if the object supports it. If it does not it simply uses new to generate a new instance","params":[{"type":{"names":["String"]},"description":"The id of the resource for which to create a new instance.","name":"id"}],"returns":[{"type":{"names":["Object"]},"description":"a new instance of the specified object."}],"name":"newResourceFromPool","longname":"ResourceManager.newResourceFromPool","kind":"function","memberof":"ResourceManager","scope":"static","$longname":"ResourceManager.newResourceFromPool"},{"comment":"/**\n     * Register a script as resource: this allows to retrieve it using the resourceManager\n     * at runtime.\n     *\n     * `notes`\n     * During athenajs development, systemjs loader was used instead of Webpack\n     * systemjs allows to load any script during *runtime*\n     *\n     * This allowed to load script (sprite) resources at runtime, on-demand.\n     *\n     * Unfortunately, this is not possible at all with ES6/Webpack which needs to\n     * know during build-process which scripts will be needed at runtime to build\n     * dependency graphs.\n     *\n     */","meta":{"range":[13142,13508],"filename":"ResourceManager.js","lineno":374,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Resource","code":{"id":"astnode100000948","name":"registerScript","type":"FunctionExpression"},"vars":{"existing":"ResourceManager.registerScript~existing","this.dynamicScripts[undefined]":"ResourceManager.registerScript#dynamicScripts[undefined]"}},"description":"Register a script as resource: this allows to retrieve it using the resourceManager\nat runtime.\n\n`notes`\nDuring athenajs development, systemjs loader was used instead of Webpack\nsystemjs allows to load any script during *runtime*\n\nThis allowed to load script (sprite) resources at runtime, on-demand.\n\nUnfortunately, this is not possible at all with ES6/Webpack which needs to\nknow during build-process which scripts will be needed at runtime to build\ndependency graphs.","name":"registerScript","longname":"ResourceManager.registerScript","kind":"function","memberof":"ResourceManager","scope":"static","$longname":"ResourceManager.registerScript"}]}],"symbols":["ResourceManager","ResourceManager.addResources","ResourceManager.createObjectPool","ResourceManager.getResourceById","ResourceManager.loadAudio","ResourceManager.loadImage","ResourceManager.loadJSON","ResourceManager.loadNextResource","ResourceManager.loadResources","ResourceManager.loadWadAudio","ResourceManager.newResourceFromPool","ResourceManager.registerScript"]},"notification":{"documentation":[{"comment":"/**\n * The notification manager allows different AthenaJS components to send/receive\n * events.\n */","meta":{"range":[132,1430],"filename":"NotificationManager.js","lineno":7,"columnno":6,"path":"E:\\Docs\\Dev\\athenajs\\js\\Notification","code":{"id":"astnode100000007","name":"NotificationManager","type":"ObjectExpression","value":"{\"notify\":\"\",\"listen\":\"\"}"}},"description":"The notification manager allows different AthenaJS components to send/receive\nevents.","name":"NotificationManager","longname":"NotificationManager","kind":"constant","scope":"global","params":[],"$longname":"NotificationManager","$members":[{"comment":"/**\n     * Listen to a particular event\n     *\n     * @param {String} eventType The event to listen to.\n     * @param {Function} method The callback function to call when notified.\n     */","meta":{"range":[1019,1428],"filename":"NotificationManager.js","lineno":32,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Notification","code":{"id":"astnode100000057","name":"listen","type":"FunctionExpression"},"vars":{"eventList":"NotificationManager.listen~eventList","":null}},"description":"Listen to a particular event","params":[{"type":{"names":["String"]},"description":"The event to listen to.","name":"eventType"},{"type":{"names":["function"]},"description":"The callback function to call when notified.","name":"method"}],"name":"listen","longname":"NotificationManager.listen","kind":"function","memberof":"NotificationManager","scope":"static","$longname":"NotificationManager.listen"},{"comment":"/**\n     * Notifies all listeners\n     *\n     * @param {String} eventType The event to send.\n     * @param {any} data The data to send with the event.\n     *\n     * Every listener that has subscribed to this event will be notified.\n     */","meta":{"range":[404,820],"filename":"NotificationManager.js","lineno":16,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Notification","code":{"id":"astnode100000010","name":"notify","type":"FunctionExpression"},"vars":{"params":"NotificationManager.notify~params","":null}},"description":"Notifies all listeners","params":[{"type":{"names":["String"]},"description":"The event to send.","name":"eventType"},{"type":{"names":["any"]},"description":"The data to send with the event.\n\nEvery listener that has subscribed to this event will be notified.","name":"data"}],"name":"notify","longname":"NotificationManager.notify","kind":"function","memberof":"NotificationManager","scope":"static","$longname":"NotificationManager.notify"}]}],"symbols":["NotificationManager","NotificationManager.listen","NotificationManager.notify"]},"utils":{"documentation":[{"comment":"/**\n * Object that allows sending & receving binary data using HTTP\n */","meta":{"range":[114,1190],"filename":"Binary.js","lineno":6,"columnno":6,"path":"E:\\Docs\\Dev\\athenajs\\js\\Util","code":{"id":"astnode100000007","name":"Binary","type":"ObjectExpression","value":"{\"sendArrayBufferView\":\"\",\"getArrayBuffer\":\"\"}"}},"description":"Object that allows sending & receving binary data using HTTP","name":"Binary","longname":"Binary","kind":"constant","scope":"global","params":[],"$longname":"Binary","$members":[{"comment":"/**\n     * Retrieves binary data from the server\n     *\n     * @param {String} url Url to get binary data from.\n     * @returns {Promise} promise that is fullfilled with ArrayBuffer or false if get failed\n     */","meta":{"range":[671,1188],"filename":"Binary.js","lineno":27,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Util","code":{"id":"astnode100000034","name":"getArrayBuffer","type":"FunctionExpression"},"vars":{"":null}},"description":"Retrieves binary data from the server","params":[{"type":{"names":["String"]},"description":"Url to get binary data from.","name":"url"}],"returns":[{"type":{"names":["Promise"]},"description":"promise that is fullfilled with ArrayBuffer or false if get failed"}],"name":"getArrayBuffer","longname":"Binary.getArrayBuffer","kind":"function","memberof":"Binary","scope":"static","$longname":"Binary.getArrayBuffer"},{"comment":"/**\n     * Sends binary as POST\n     *\n     * @param {ArrayBufferView} view Binary data to send.\n     * @param {String} url Url to post binary data to.\n     */","meta":{"range":[293,447],"filename":"Binary.js","lineno":13,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Util","code":{"id":"astnode100000010","name":"sendArrayBufferView","type":"FunctionExpression"},"vars":{"req":"Binary.sendArrayBufferView~req"}},"description":"Sends binary as POST","params":[{"type":{"names":["ArrayBufferView"]},"description":"Binary data to send.","name":"view"},{"type":{"names":["String"]},"description":"Url to post binary data to.","name":"url"}],"name":"sendArrayBufferView","longname":"Binary.sendArrayBufferView","kind":"function","memberof":"Binary","scope":"static","$longname":"Binary.sendArrayBufferView"}]},{"comment":"/**\n * Simple wrapper for ES6 native Promise\n * \n * @example\n * \n * import {Deferred} from 'athenajs';\n * \n * let def = new Deferred(),\n * promise = def.promise;\n * \n * setTimeout(() => {\n *   def.resolve('done');\n * }, 5000);\n * \n * promise.then((res) => {\n *  console.log('message recived', res);\n * });\n * \n */","meta":{"range":[350,808],"filename":"Deferred.js","lineno":22,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\Util","code":{"id":"astnode100000103","name":"Deferred","type":"ClassDeclaration","paramnames":[]}},"classdesc":"Simple wrapper for ES6 native Promise","examples":["import {Deferred} from 'athenajs';\n\nlet def = new Deferred(),\npromise = def.promise;\n\nsetTimeout(() => {\n  def.resolve('done');\n}, 5000);\n\npromise.then((res) => {\n console.log('message recived', res);\n});"],"name":"Deferred","longname":"Deferred","kind":"class","scope":"global","description":"Creates a new Deferred.","params":[],"$longname":"Deferred","$members":[{"comment":"/**\n     * Creates and immediately resolves a new deferred.\n     *\n     * @param {any} val the value to resolve the promise with\n     * \n     * \n     */","meta":{"range":[742,806],"filename":"Deferred.js","lineno":40,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Util","code":{"id":"astnode100000133","name":"Deferred.resolve","type":"MethodDefinition","paramnames":["val"]},"vars":{"":null}},"description":"Creates and immediately resolves a new deferred.","params":[{"type":{"names":["any"]},"description":"the value to resolve the promise with","name":"val"}],"name":"resolve","longname":"Deferred.resolve","kind":"function","memberof":"Deferred","scope":"static","$longname":"Deferred.resolve"}],"$constructor":{"comment":"/**\n     * Creates a new Deferred.\n     */","meta":{"range":[418,579],"filename":"Deferred.js","lineno":26,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Util","code":{"id":"astnode100000106","name":"Deferred","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Creates a new Deferred.","name":"Deferred","longname":"Deferred","kind":"class","scope":"global","params":[],"undocumented":true,"$longname":"Deferred"}},{"comment":"/**\n * Dom is a very simple jQuery-like object that allows to manipulate\n * a collection of DOM elements.\n *\n * As in jQuery, you may manipulate individual Dom elements using [] operator\n *\n * @param {(HTMLElement|String)} [selector=null] The optional selector to use to create the new Dom collection\n * \n * @class\n * @constructor\n * \n * @example\n * \n * import {Dom} from 'athenajs';\n * \n * // removes the `foo` class to every `.foo` element\n * Dom('.foo').removeClass('foo');\n */","meta":{"range":[583,1099],"filename":"Dom.js","lineno":21,"columnno":0,"path":"E:\\Docs\\Dev\\athenajs\\js\\Util","code":{"id":"astnode100000148","name":"Dom","type":"FunctionDeclaration","paramnames":["selector"]}},"description":"Dom is a very simple jQuery-like object that allows to manipulate\na collection of DOM elements.\n\nAs in jQuery, you may manipulate individual Dom elements using [] operator","params":[{"type":{"names":["HTMLElement","String"]},"optional":true,"defaultvalue":null,"description":"The optional selector to use to create the new Dom collection","name":"selector"}],"kind":"class","classdesc":null,"examples":["import {Dom} from 'athenajs';\n\n// removes the `foo` class to every `.foo` element\nDom('.foo').removeClass('foo');"],"name":"Dom","longname":"Dom","scope":"global","$longname":"Dom","$members":[{"comment":"/**\n     * Add one or more CSS classes to a DOM collection\n     *\n     * @param {String} name space-separated list of classes to add\n     * @returns {Dom} `this`\n     *\n     * @memberof Dom#\n     */","meta":{"range":[4129,4315],"filename":"Dom.js","lineno":150,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Util","code":{"id":"astnode100000445","name":"addClass","type":"FunctionExpression"},"vars":{"classes":"Dom#addClass~classes","":null}},"description":"Add one or more CSS classes to a DOM collection","params":[{"type":{"names":["String"]},"description":"space-separated list of classes to add","name":"name"}],"returns":[{"type":{"names":["Dom"]},"description":"`this`"}],"memberof":"Dom","name":"addClass","longname":"Dom#addClass","kind":"function","scope":"instance","$longname":"Dom#addClass"},{"comment":"/**\n     * Append current collection to the element with a specific selector\n     *\n     * @param {String|HTMLElement} selector Target element where to append selected elements.\n     * It can either be a CSS selector or a DOM HTMLElement.\n     * @returns {Dom} `this`\n     *\n     * @memberof Dom#\n     */","meta":{"range":[2958,3246],"filename":"Dom.js","lineno":105,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Util","code":{"id":"astnode100000355","name":"appendTo","type":"FunctionExpression"},"vars":{"target":"Dom#appendTo~target","":null}},"description":"Append current collection to the element with a specific selector","params":[{"type":{"names":["String","HTMLElement"]},"description":"Target element where to append selected elements.\nIt can either be a CSS selector or a DOM HTMLElement.","name":"selector"}],"returns":[{"type":{"names":["Dom"]},"description":"`this`"}],"memberof":"Dom","name":"appendTo","longname":"Dom#appendTo","kind":"function","scope":"instance","$longname":"Dom#appendTo"},{"comment":"/**\n     * Change multiple attributes at once\n     *\n     * @param {String|Object} att attribute name to modify or list of attributes+values to change\n     * @param {String} val value of the attribute to set\n     * @returns {Dom} `this`\n     *\n     * @memberof Dom#\n     */","meta":{"range":[3531,3919],"filename":"Dom.js","lineno":126,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Util","code":{"id":"astnode100000393","name":"attr","type":"FunctionExpression"},"vars":{"":null}},"description":"Change multiple attributes at once","params":[{"type":{"names":["String","Object"]},"description":"attribute name to modify or list of attributes+values to change","name":"att"},{"type":{"names":["String"]},"description":"value of the attribute to set","name":"val"}],"returns":[{"type":{"names":["Dom"]},"description":"`this`"}],"memberof":"Dom","name":"attr","longname":"Dom#attr","kind":"function","scope":"instance","$longname":"Dom#attr"},{"comment":"/**\n     * jQuery-like CSS method to easily set multiple styles on a dom collection\n     *\n     * @param {String|Object} prop or list of properties with their new value\n     * @param {String} val value of the property\n     * @returns {Dom} `this`\n     *\n     * @memberof Dom#\n     */","meta":{"range":[1454,2060],"filename":"Dom.js","lineno":51,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Util","code":{"id":"astnode100000227","name":"css","type":"FunctionExpression"},"vars":{"":null}},"description":"jQuery-like CSS method to easily set multiple styles on a dom collection","params":[{"type":{"names":["String","Object"]},"description":"or list of properties with their new value","name":"prop"},{"type":{"names":["String"]},"description":"value of the property","name":"val"}],"returns":[{"type":{"names":["Dom"]},"description":"`this`"}],"memberof":"Dom","name":"css","longname":"Dom#css","kind":"function","scope":"instance","$longname":"Dom#css"},{"comment":"/**\n     * Returns a new collection with elements matching the selector found inside current collection\n     *\n     * @param {String} selector the selector to match\n     * @returns {Dom} a new Dom collection with found elements\n     * \n     * @memberof Dom#\n     */","meta":{"range":[2337,2642],"filename":"Dom.js","lineno":83,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Util","code":{"id":"astnode100000307","name":"find","type":"FunctionExpression"},"vars":{"newDom":"Dom#find~newDom","":null}},"description":"Returns a new collection with elements matching the selector found inside current collection","params":[{"type":{"names":["String"]},"description":"the selector to match","name":"selector"}],"returns":[{"type":{"names":["Dom"]},"description":"a new Dom collection with found elements"}],"memberof":"Dom","name":"find","longname":"Dom#find","kind":"function","scope":"instance","$longname":"Dom#find"},{"comment":"/**\n     * Hides specified set of elements\n     * @returns {Dom} `this`\n     *\n     * @memberof Dom#\n     */","meta":{"range":[5357,5488],"filename":"Dom.js","lineno":210,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Util","code":{"id":"astnode100000544","name":"hide","type":"FunctionExpression"},"vars":{"":null}},"description":"Hides specified set of elements","returns":[{"type":{"names":["Dom"]},"description":"`this`"}],"memberof":"Dom","name":"hide","longname":"Dom#hide","kind":"function","scope":"instance","$longname":"Dom#hide"},{"comment":"/**\n     * Changes innerHTML of a collection\n     *\n     * @param {String} html to set as innerHTML\n     * @returns {Dom} `this`\n     *\n     * @memberof Dom#\n     */","meta":{"range":[4879,4985],"filename":"Dom.js","lineno":184,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Util","code":{"id":"astnode100000505","name":"html","type":"FunctionExpression"},"vars":{"":null}},"description":"Changes innerHTML of a collection","params":[{"type":{"names":["String"]},"description":"to set as innerHTML","name":"html"}],"returns":[{"type":{"names":["Dom"]},"description":"`this`"}],"memberof":"Dom","name":"html","longname":"Dom#html","kind":"function","scope":"instance","$longname":"Dom#html"},{"comment":"/**\n     * Remove one or more CSS classes to a DOM collection\n     *\n     * @param {String} name Space-separated list of classes to remove.\n     * @returns {Dom} `this`\n     *\n     * @memberof Dom#\n     */","meta":{"range":[4532,4702],"filename":"Dom.js","lineno":168,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Util","code":{"id":"astnode100000476","name":"removeClass","type":"FunctionExpression"},"vars":{"classes":"Dom#removeClass~classes","":null}},"description":"Remove one or more CSS classes to a DOM collection","params":[{"type":{"names":["String"]},"description":"Space-separated list of classes to remove.","name":"name"}],"returns":[{"type":{"names":["Dom"]},"description":"`this`"}],"memberof":"Dom","name":"removeClass","longname":"Dom#removeClass","kind":"function","scope":"instance","$longname":"Dom#removeClass"},{"comment":"/**\n     * Shows specified set of elements\n     * @returns {Dom} `this`\n     *\n     * @memberof Dom#\n     */","meta":{"range":[5105,5237],"filename":"Dom.js","lineno":196,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Util","code":{"id":"astnode100000523","name":"show","type":"FunctionExpression"},"vars":{"":null}},"description":"Shows specified set of elements","returns":[{"type":{"names":["Dom"]},"description":"`this`"}],"memberof":"Dom","name":"show","longname":"Dom#show","kind":"function","scope":"instance","$longname":"Dom#show"}]},{"comment":"/**\n * Pool support for AthenaJS\n *\n * With a Pool objects are defined ahead of time, and any free instance\n * from the pool is used when you want to use a new object.\n */","meta":{"range":[178,2422],"filename":"Pool.js","lineno":7,"columnno":6,"path":"E:\\Docs\\Dev\\athenajs\\js\\Util","code":{"id":"astnode100000570","name":"Pool","type":"ObjectExpression","value":"{\"create\":\"\"}"}},"description":"Pool support for AthenaJS\n\nWith a Pool objects are defined ahead of time, and any free instance\nfrom the pool is used when you want to use a new object.","name":"Pool","longname":"Pool","kind":"constant","scope":"global","params":[],"$longname":"Pool","$members":[{"comment":"/**\n     * Creates a new pool\n     *\n     * @param {Function} obj the constructor of the object to add a pool for\n     * @param {Number} size the size of the pool\n     */","meta":{"range":[366,2420],"filename":"Pool.js","lineno":14,"columnno":4,"path":"E:\\Docs\\Dev\\athenajs\\js\\Util","code":{"id":"astnode100000573","name":"create","type":"FunctionExpression"},"vars":{"obj._pool":"obj._pool","obj._poolMarker":"obj._poolMarker","obj._poolSize":"obj._poolSize","pool":"Pool.create~pool","obj.createFromPool":"obj.createFromPool","":null,"obj.expandPool":"obj.expandPool","obj.prototype.freeFromPool":"obj#freeFromPool"}},"description":"Creates a new pool","params":[{"type":{"names":["function"]},"description":"the constructor of the object to add a pool for","name":"obj"},{"type":{"names":["Number"]},"description":"the size of the pool","name":"size"}],"name":"create","longname":"Pool.create","kind":"function","memberof":"Pool","scope":"static","$longname":"Pool.create"}]}],"symbols":["Binary","Binary.getArrayBuffer","Binary.sendArrayBufferView","Deferred","Deferred.resolve","Dom","Dom#addClass","Dom#appendTo","Dom#attr","Dom#css","Dom#find","Dom#hide","Dom#html","Dom#removeClass","Dom#show","Pool","Pool.create"]}},"app":{"title":"AthenaJS Documentation","meta":null,"entrance":"content:home","routing":{"method":"query","caseSensitive":true},"server":"github","base":"/athenajs-documentation/"},"template":{"name":"Docma AthenaJS Template","version":"0.1.0","author":"Nicolas Ramz (nicolas.ramz@gmail.com)","license":"MIT","main":"index.html","options":{"title":"AthenaJS","sidebar":true,"collapsed":false,"outline":"tree","badges":true,"symbolMeta":true,"collapseSymbols":true,"collapseDefinition":true,"propertiesLast":true,"typeDefinitionLink":true,"search":true,"navbar":true,"navItems":[{"iconClass":"fas fa-home","label":"Home","href":"./"},{"iconClass":"fas fa-code","label":"Getting Started","href":"?content=start"},{"iconClass":"fas fa-list","label":"API","items":[{"label":"Game","href":"?api=game"},{"label":"Scene","href":"?api=scene"},{"separator":true},{"label":"Drawable","href":"?api=drawable"},{"label":"Behaviors","href":"?api=behaviors"},{"label":"Effects","href":"?api=fx"},{"separator":true},{"label":"Map","href":"?api=map"},{"separator":true},{"label":"AudioManager","href":"?api=audio"},{"label":"InputManager","href":"?api=input"},{"label":"NotificationManager","href":"?api=notification"},{"label":"ResourceManager","href":"?api=resource"},{"separator":true},{"label":"Utils","href":"?api=utils"}]},{"iconClass":"fas fa-gamepad","label":"Made with AthenaJS","href":"?content=made_with_athenajs"},{"iconClass":"fab fa-github","label":"GitHub","href":"https://github.com/AthenaJS/athenajs"}]}},"_":{"partials":{"api":"docma-api","content":"docma-content","notFound":"docma-404"},"elementID":"docma-main","contentElementID":"docma-content","logsEnabled":true}};
/* global docma */
/* eslint no-nested-ternary:0 */

// docma.dom
// https://github.com/onury/docma
(function () {

    // --------------------------------
    // DOM METHODS
    // --------------------------------

    var dom = {};

    /**
     *  Creates and appends a child DOM element to the target, from the given
     *  element definition.
     *  @private
     *  @memberof docma.dom
     *
     *  @param {HTMLElement} target
     *         Target container element.
     *  @param {String} [type="div"]
     *         Type of the element to be appended.
     *  @param {Object} [attrs]
     *         Element attributes.
     *
     *  @returns {HTMLElement} - Appended element.
     */
    dom.createChild = function (target, type, attrs) {
        attrs = attrs || {};
        var el = document.createElement(type || 'div');
        Object.keys(attrs).forEach(function (key) {
            el[key] = attrs[key]; // e.g. id, innerHTML, etc...
        });
        target.appendChild(el);
        return el;
    };

    /**
     *  Gets Docma main DOM element which the Dust templates will be rendered
     *  into.
     *  @private
     *  @memberof docma.dom
     *
     *  @returns {HTMLElement} - Docma main DOM element.
     */
    dom.getDocmaElem = function () {
        var docmaElem = document.getElementById(docma._.elementID);
        if (!docmaElem) {
            docmaElem = dom.createChild(document.body, 'div', {
                id: docma._.elementID
            });
        }
        return docmaElem;
    };

    /**
     *  Gets Docma content DOM element that the HTML content will be loaded
     *  into. This should be called for `docma-content` partial.
     *  @private
     *  @memberof docma.dom
     *
     *  @returns {HTMLElement} - Docma content DOM element.
     */
    dom.getContentElem = function () {
        // docma-content template (should) have a
        // <div id="docma-content"></div> element whithin.
        var dContent = document.getElementById(docma._.contentElementID);
        if (!dContent) {
            // this is fatal, so we always throw if invalid content partial
            // TODO: this should be checked during build process
            throw new Error('Partial ' + docma._.partials.content + ' should have an element with id="' + docma._.contentElementID + '".');
        }
        return dContent;
    };

    /**
     *  Loads dust-compiled HTML content into `docma-main` element.
     *  @private
     *  @memberof docma.dom
     *
     *  @param {String} compiledHTML - Dust-compiled HTML content.
     */
    dom.loadCompiledContent = function (compiledHTML) {
        // load compiled content into <div id="docma-main"></div>
        var docmaElem = dom.getDocmaElem();
        docmaElem.innerHTML = compiledHTML;
        // dom.fixAnchors();
    };

    /**
     *  Loads the given HTML content into `docma-content` element.
     *  @private
     *  @memberof docma.dom
     *
     *  @param {String} html - Content to be loaded.
     */
    dom.loadContent = function (html) {
        var dContent = dom.getContentElem();
        dContent.innerHTML = html;
        // dom.fixAnchors();
        dom.scrollTo(); // top
    };

    /**
     *  Gets the offset coordinates of the given element, relative to document
     *  body.
     *  @private
     *  @memberof docma.dom
     *
     *  @param {HTMLElement} e - Target element.
     */
    dom.getOffset = function (e) {
        var elem = typeof e === 'object' ? e : document.getElementById(e);
        if (!elem) return;
        var rect = elem.getBoundingClientRect();
        // Make sure element is not hidden (display: none) or disconnected
        if (rect.width || rect.height || elem.getClientRects().length) {
            var docElem = document.documentElement;
            return {
                top: rect.top + window.pageYOffset - docElem.clientTop,
                left: rect.left + window.pageXOffset - docElem.clientLeft
            };
        }
    };

    /**
     *  Scrolls the document to the given hash target.
     *  @private
     *  @memberof docma.dom
     *
     *  @param {String} [hash] - Bookmark target. If omitted, document is
     *  scrolled to the top.
     */
    dom.scrollTo = function (hash) {
        hash = (hash || window.location.hash || '').replace(/^#/, '');
        if (!hash) {
            document.body.scrollTop = 0;
            return;
        }
        var elem = document.getElementById(hash);
        if (!elem) return;
        document.body.scrollTop = dom.getOffset(elem).top;
    };

    /**
     *  Fixes the base+hash issue. When base tag is set in the head of an HTML,
     *  bookmark anchors will navigate to the base URL with a hash; even with
     *  sub paths. This will fix that behaviour.
     *  @private
     *  @memberof docma.dom
     *
     *  @returns {void}
     */
    dom.fixAnchors = function () {
        if (docma.app.base) {
            setTimeout(function () {
                var i, el,
                    nodes = document.querySelectorAll('a[href^="#"]');
                for (i = 0; i < nodes.length; i++) {
                    el = nodes[i];
                    var href = el.getAttribute('href');
                    if (href.slice(0, 1) === '#' && href.length > 1) {
                        href = window.location.pathname + (window.location.search || '') + href;
                        el.setAttribute('href', href);
                    }
                }
            }, 50);
        }
    };

    // --------------------------------

    /**
     *  Utilities for Docma DOM operations.
     *  @namespace
     *  @private
     */
    docma.dom = Object.freeze(dom);

})();

/* global docma, dust */
/* eslint */

// docma.web.filters
// https://github.com/onury/docma
(function () {

    dust.filters = dust.filters || {};

    dust.filters.$pt = function (str) {
        return docma.utils.parseTicks(str);
    };

    dust.filters.$pnl = function (str) {
        return docma.utils.parseNewLines(str, { keepIfSingle: true });
    };

    dust.filters.$pl = function (str) {
        return docma.utils.parseLinks(str);
    };

    dust.filters.$tl = function (str) {
        return docma.utils.trimLeft(str);
    };

    dust.filters.$p = function (str) {
        return docma.utils.parse(str, { keepIfSingle: true });
    };

    dust.filters.$nt = function (str) {
        return docma.utils.normalizeTabs(str);
    };

    dust.filters.$desc = function (symbol) {
        return docma.utils.parse(symbol.classdesc || symbol.description || '');
    };

    dust.filters.$def = function (param) {
        return param.optional ? String(param.defaultvalue) : '';
    };

    var reJSValues = (/true|false|null|undefined|Infinity|NaN|\d+|Number\.\w+|Math\.(PI|E|LN(2|10)|LOG(2|10)E|SQRT(1_)?2)|\[.*?]|\{.*?}|new [a-zA-Z]+.*|\/.+\/[gmiu]*|Date\.(now\(\)|UTC\(.*)|window|document/);
    dust.filters.$val = function (symbol) {
        var val = docma.utils.notate(symbol, 'meta.code.value');
        if (val === undefined) return '';
        if (typeof val !== 'string') return val;
        var types = docma.utils.notate(symbol, 'type.names') || [];
        // first char is NOT a single or double quote or tick
        if (!(/['"`]/).test(val.slice(0, 1))
                // types include "String"
                && types.indexOf('String') >= 0
                // only "String" type or value is NOT a JS non-string value/keyword
                && (types.length === 1 || reJSValues.indexOf(val) === -1)) {
            return '"' + val + '"';
        }
        return val;
    };

    dust.filters.$id = function (symbol) {
        var id;
        if (typeof symbol === 'string') {
            id = symbol;
        } else {
            var nw = docma.utils.isConstructor(symbol) ? 'new-' : '';
            id = nw + symbol.$longname; // docma.utils.getFullName(symbol);
        }
        return id.replace(/ /g, '-');
    };

})();

/* global docma */
/* eslint no-nested-ternary:0 */

// docma.location
// https://github.com/onury/docma
(function () {

    // --------------------------------
    // HELPER METHODS
    // --------------------------------

    /**
     *  @private
     */
    function _ensureSlash(left, str, right) {
        if (!str) return left || right ? '/' : '';
        if (left && str.slice(0, 1) !== '/') str = '/' + str;
        if (right && str.slice(-1) !== '/') str += '/';
        return str;
    }

    /**
     *  @private
     */
    function _getQueryValue(name, query) {
        // Modified from http://stackoverflow.com/a/901144/112731
        query = query === undefined ? (window.location.search || '') : query;
        if (query.slice(0, 1) === '?') query = query.slice(1);
        name = name.replace(/[\[\]]/g, '\\$&');
        var regex = new RegExp('&?' + name + '(=([^&#]*)|&|#|$)'),
            results = regex.exec(query);
        if (!results || !results[2]) return '';
        return decodeURIComponent(results[2].replace(/\+/g, ' '));
    }

    // --------------------------------
    // docma.location
    // --------------------------------

    /**
     *  Similar to `window.location` but with differences and additional
     *  information.
     *
     *  @name docma.location
     *  @type {Object}
     *  @readonly
     *
     *  @property {String} origin
     *            Gets the protocol, hostname and port number of the current URL.
     *  @property {String} host
     *            Gets the hostname and port number of the current URL.
     *  @property {String} hostname
     *            Gets the domain name of the web host.
     *  @property {String} protocol
     *            Gets the web protocol used, without `:` suffix.
     *  @property {String} href
     *            Gets the href (URL) of the current location.
     *  @property {String} entrance
     *            Gets the application entrance route, which is set at Docma build-time.
     *  @property {String} base
     *            Gets the base path of the application URL, which is set at Docma build-time.
     *  @property {String} fullpath
     *            Gets the path and filename of the current URL.
     *  @property {String} pathname
     *            Gets the path and filename of the current URL, without the base.
     *  @property {String} path
     *            Gets the path, filename and query-string of the current URL, without the base.
     *  @property {String} hash
     *            Gets the anchor `#` of the current URL, without `#` prefix.
     *  @property {String} query
     *            Gets the querystring part of the current URL, without `?` prefix.
     *  @property {Function} getQuery()
     *            Gets the value of the given querystring parameter.
     */
    Object.defineProperty(docma, 'location', {
        configurable: false,
        get: function () {
            var fullpath = _ensureSlash(true, window.location.pathname, true),
                base = _ensureSlash(true, docma.app.base, true),
                pathname = fullpath;
            if (fullpath.slice(0, base.length) === base) {
                pathname = fullpath.slice(base.length - 1, fullpath.length);
            }
            return {
                host: window.location.host,
                hostname: window.location.hostname,
                origin: window.location.origin,
                port: window.location.port,
                protocol: (window.location.protocol || '').replace(/:$/, ''),
                entrance: _ensureSlash(true, docma.app.entrance, false),
                base: base,
                hash: (window.location.hash || '').replace(/^#/, ''),
                query: (window.location.search || '').replace(/^\?/, ''),
                href: window.location.href,
                fullpath: fullpath,
                pathname: pathname,
                path: pathname + (window.location.search || ''),
                getQuery: _getQueryValue

            };
        }
    });

    // --------------------------------

    docma.location = Object.freeze(docma.location);

})();

/* global docma */
/* eslint */

// docma.web.utils
// https://github.com/onury/docma

/**
 *  Utilities for inspecting JSDoc documentation and symbols; and parsing
 *  documentation data into proper HTML.
 *  @name docma.utils
 *  @type {Object}
 *  @namespace
 */
(function () {

    var utils = {};

    function _getStr(value) {
        return value && value.trim() !== '' ? value : null;
    }

    // cleans the given symbol name.
    // e.g. <anonymous>~obj.doStuff —> obj.doStuff
    function _cleanName(name) {
        return (name || '').replace(/([^>]+>)?~?(.*)/, '$2');
    }

    function _identity(o) { return o; }

    /**
     *  Gets the value of the target property by the given dot
     *  {@link https://github.com/onury/notation|notation}.
     *  @memberof docma
     *
     *  @param {Object} obj - Source object.
     *  @param {String} notation - Path of the property in dot-notation.
     *
     *  @returns {*} - The value of the notation. If the given notation does
     *  not exist, safely returns `undefined`.
     *
     *  @example
     *  var symbol = { code: { meta: { type: "MethodDefinition" } } };
     *  docma.utils.notate(symbol, "code.meta.type"); // returns "MethodDefinition"
     */
    utils.notate = function (obj, notation) {
        if (typeof obj !== 'object') return;
        var o,
            props = !Array.isArray(notation)
                ? notation.split('.')
                : notation,
            prop = props[0];
        if (!prop) return;
        o = obj[prop];
        if (props.length > 1) {
            props.shift();
            return utils.notate(o, props);
        }
        return o;
    };

    /**
     *  Gets the short name of the given symbol.
     *  JSDoc overwrites the `longname` and `name` of the symbol, if it has an
     *  alias. This returns the correct short name.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {String}
     */
    utils.getName = function (symbol) {
        // if @alias is set, the original (long) name is only found at meta.code.name
        if (symbol.alias) {
            var codeName = _cleanName(utils.notate(symbol, 'meta.code.name') || '');
            if (codeName) return codeName.replace(/.*?[#.~:](\w+)$/i, '$1');
        }
        return symbol.name;
    };

    /**
     *  Gets the original long name of the given symbol.
     *  JSDoc overwrites the `longname` and `name` of the symbol, if it has an
     *  alias. This returns the correct long name.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {String}
     */
    utils.getLongName = function (symbol) {
        var longName = _cleanName(symbol.longname);
        if (symbol.alias) {
            var codeName = _cleanName(utils.notate(symbol, 'meta.code.name') || '');
            if (!codeName) return longName;
            var memberOf = _cleanName(symbol.memberof || '');
            if (!memberOf) return codeName;
            var re = new RegExp('^' + memberOf + '[#\\.~:]'),
                dot = symbol.scope === 'instance' ? '#' : '.';
            return re.test(codeName) ? codeName : memberOf + dot + codeName;
        }
        return longName;
    };
    utils.getFullName = utils.getLongName;

    /**
     *  Gets the code name of the given symbol.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {String} - If no code name, falls back to long name.
     */
    utils.getCodeName = function (symbol) {
        return _cleanName(utils.notate(symbol, 'meta.code.name') || '')
            || utils.getLongName(symbol);
    };

    /**
     *  Gets the first matching symbol by the given name.
     *  @memberof docma
     *
     *  @param {Array} docs - Documentation symbols array.
     *  @param {String} name - Symbol name to be checked.
     *  @returns {Object} - Symbol object if found. Otherwise, returns `null`.
     */
    utils.getSymbolByName = function (docs, name) {
        var i, symbol;
        for (i = 0; i < docs.length; i++) {
            symbol = docs[i];
            if (symbol.name === name
                    || symbol.longname === name
                    || utils.getFullName(symbol) === name) {
                return symbol;
            }
            if (symbol.$members) {
                var sym = utils.getSymbolByName(symbol.$members, name);
                if (sym) return sym;
            }
        }
        return null;
    };

    /**
     *  Checks whether the given symbol is deprecated.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isDeprecated = function (symbol) {
        return symbol.deprecated;
    };

    /**
     *  Checks whether the given symbol has global scope.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isGlobal = function (symbol) {
        return symbol.scope === 'global';
    };

    /**
     *  Checks whether the given symbol is a namespace.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isNamespace = function (symbol) {
        return symbol.kind === 'namespace';
    };

    /**
     *  Checks whether the given symbol is a module.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isModule = function (symbol) {
        return symbol.kind === 'module';
    };

    /**
     *  Checks whether the given symbol is a class.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isClass = function (symbol) {
        return !utils.isConstructor(symbol)
            && (symbol.kind === 'class'
                || utils.notate(symbol, 'meta.code.type') === 'ClassDeclaration');
    };

    /**
     *  Checks whether the given symbol is a constructor.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isConstructor = function (symbol) {
        return symbol.kind === 'class'
            && utils.notate(symbol, 'meta.code.type') === 'MethodDefinition';
    };

    /**
     *  Checks whether the given symbol is a static member.
     *  @memberof docma
     *  @alias utils.isStatic
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isStaticMember = function (symbol) {
        return symbol.scope === 'static';
    };
    /**
     *  Alias for `utils.isStaticMember`
     *  @private
     */
    utils.isStatic = utils.isStaticMember;

    /**
     *  Checks whether the given symbol has an inner scope.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isInner = function (symbol) {
        return symbol.scope === 'inner';
    };

    /**
     *  Checks whether the given symbol is an instance member.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isInstanceMember = function (symbol) {
        return symbol.scope === 'instance';
    };

    /**
     *  Checks whether the given symbol is a method (function).
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isMethod = function (symbol) {
        var codeType = utils.notate(symbol, 'meta.code.type');
        return symbol.kind === 'function'
            || (codeType === 'MethodDefinition' || codeType === 'FunctionExpression');
    };
    utils.isFunction = utils.isMethod;

    /**
     *  Checks whether the given symbol is an instance method.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isInstanceMethod = function (symbol) {
        return utils.isInstanceMember(symbol) && utils.isMethod(symbol);
    };

    /**
     *  Checks whether the given symbol is a static method.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isStaticMethod = function (symbol) {
        return utils.isStaticMember(symbol) && utils.isMethod(symbol);
    };

    /**
     *  Checks whether the given symbol is a property.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isProperty = function (symbol) {
        return symbol.kind === 'member';
            // && notate(symbol, 'meta.code.type') === 'MethodDefinition';
    };

    /**
     *  Checks whether the given symbol is an instance property.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isInstanceProperty = function (symbol) {
        return utils.isInstanceMember(symbol) && utils.isProperty(symbol);
    };

    /**
     *  Checks whether the given symbol is a static property.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isStaticProperty = function (symbol) {
        return utils.isStaticMember(symbol) && utils.isProperty(symbol);
    };

    /**
     *  Checks whether the given symbol is a custom type definition.
     *  @memberof docma
     *  @alias utils.isCustomType
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isTypeDef = function (symbol) {
        return symbol.kind === 'typedef';
    };
    /**
     *  Alias for `utils.isTypeDef`
     *  @private
     */
    utils.isCustomType = utils.isTypeDef;

    /**
     *  Checks whether the given symbol is an enumeration.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isEnum = function (symbol) {
        return symbol.isEnum;
    };

    /**
     *  Checks whether the given symbol is read-only.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isReadOnly = function (symbol) {
        return symbol.readonly;
    };

    /**
     *  Checks whether the given symbol has `public` access.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isPublic = function (symbol) {
        return typeof symbol.access !== 'string' || symbol.access === 'public';
    };

    /**
     *  Checks whether the given symbol has `private` access.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isPrivate = function (symbol) {
        return symbol.access === 'private';
    };

    /**
     *  Checks whether the given symbol has `protected` access.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isProtected = function (symbol) {
        return symbol.access === 'protected';
    };

    /**
     *  Checks whether the given symbol is undocumented.
     *  This checks if the symbol has any comments.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isUndocumented = function (symbol) {
        // we could use the `undocumented` property but it still seems buggy.
        // https://github.com/jsdoc3/jsdoc/issues/241
        // `undocumented` is omitted (`undefined`) for documented symbols.
        // return symbol.undocumented !== true;
        return !symbol.comments;
    };

    /**
     *  Checks whether the given symbol has description.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.hasDescription = function (symbol) {
        return Boolean(_getStr(symbol.classdesc) || _getStr(symbol.description));
    };

    // ----

    /**
     *  GGets the types of the symbol as a string (joined with pipes `|`).
     *  @memberof docma
     *
     *  @param {Object} symbol - Target documentation symbol.
     *  @returns {String}
     *
     *  @example
     *  var symbol = { "type": { "names": ["Number", "String"] } };
     *  docma.util.getTypes(symbol); // Number|String
     */
    utils.getTypes = function (symbol) {
        if (symbol.kind === 'class') return 'class';
        var types = utils.notate(symbol, 'type.names') || [];
        // remove dots from types such as Array.<String>
        types = types.map(function (t) {
            return t.replace(/\.</g, '<');
        }).join('|');
        return symbol.isEnum ? 'enum<' + types + '>' : types;
    };

    // e.g.
    // "returns": [
    //   {
    //     "type": { "names": ["Date"] },
    //     "description": "- Current date."
    //   }
    // ]

    /**
     *  Gets the return types of the symbol as a string (joined with pipes `|`).
     *  @memberof docma
     *
     *  @param {Object} symbol - Target documentation symbol.
     *  @returns {String}
     */
    utils.getReturnTypes = function (symbol) {
        var ret = symbol.returns;
        if (!Array.isArray(ret)) return 'void';
        var names;
        var allNames = ret.reduce(function (memo, r) {
            names = utils.notate(r, 'type.names');
            if (Array.isArray(names)) {
                return memo.concat(names);
            }
            return memo;
        }, []);
        return allNames.length > 0
            ? allNames.join('|')
            : 'void';
    };

    /**
     *  Removes leading spaces and dashes. Useful when displaying symbol
     *  descriptions.
     *  @memberof docma
     *
     *  @param {String} string - String to be trimmed.
     *  @returns {String}
     */
    utils.trimLeft = function (string) {
        // remove leading space and dashes.
        return string.replace(/^[\s\n\r\-—]*/, '');
    };

    /**
     *  Converts back-ticks to HTML code tags.
     *  @memberof docma
     *
     *  @param {String} string
     *         String to be parsed.
     *
     *  @returns {String}
     */
    utils.parseTicks = function (string) {
        return string
            .replace(/(```\s*)([\s\S]*?)(\s*```)/g, function (match, p1, p2) { // , p3, offset, string
                return utils.normalizeTabs(utils._wrapEscapeCode(p2, true).replace(/`/g, '&#x60;'));
            })
            .replace(/(`)(.*?)(`)/g, function (match, p1, p2) { // , p3, offset, string
                return utils._wrapEscapeCode(p2);
            });
    };

    /**
     *  Converts new lines to HTML paragraphs.
     *  @memberof docma
     *
     *  @param {String} string
     *         String to be parsed.
     *  @param {Object} [options]
     *         Parse options.
     *         @param {Boolean} [options.keepIfSingle=false]
     *                If `true`, lines will not be converted to paragraphs.
     *
     *  @returns {String}
     */
    utils.parseNewLines = function (string, options) {
        options = options || {};
        return utils._tokenize(string, function (block, isCode) {
            if (isCode) return block;
            var parts = block.split(/[\r\n]{2,}/);
            if (parts.length <= 1 && options.keepIfSingle) return block;
            return parts.map(function (part) {
                return '<p>' + part + '</p>';
            }).join('');
        }).join('');
    };

    /**
     *  Converts JSDoc `@link` directives to HTML anchor tags.
     *  @memberof docma
     *
     *  @param {String} string
     *         String to be parsed.
     *  @param {Object} [options]
     *         Parse options.
     *         @param {String} [options.target]
     *                Href target. e.g. `"_blank"`
     *
     *  @returns {String}
     */
    utils.parseLinks = function (string, options) { // TODO: base path
        options = options || {};
        var re = /\{@link +([^}]*?)\}/g;
        var out = string.replace(re, function (match, p1) { // , offset, string
            var link, label,
                parts = p1.split('|');
            if (parts.length === 1) {
                link = label = parts[0].trim();
            } else {
                link = parts[0].trim();
                label = parts[1].trim();
            }
            // label = utils.parseTicks(label);
            // if the link is a symbol, prepend with a hash to trigger the bookmark when clicked
            // if (symbolNames && symbolNames.indexOf(link) >= 0) {..}
            // if no slash, treat this as a bookmark
            // if ((/\//i).test(link) === false) {
            //     return '<a href="#' + link + '">' + label + '</a>';
            // }
            var target = options.target
                ? ' target="' + options.target + '"'
                : '';
            return '<a href="' + link + '"' + target + '>' + label + '</a>';
        });
        return utils.parseTicks(out);
    };

    /**
     *  Parses the given string into proper HTML. Removes leading whitespace,
     *  converts new lines to paragraphs, ticks to code tags and JSDoc links to
     *  anchors.
     *  @memberof docma
     *
     *  @param {String} string
     *         String to be parsed.
     *  @param {Object} [options]
     *         Parse options.
     *         @param {Object} [options.keepIfSingle=false]
     *                If enabled, single lines will not be converted to paragraphs.
     *         @param {String} [options.target]
     *                Href target for links. e.g. `"_blank"`
     *
     *  @returns {String}
     */
    utils.parse = function (string, options) {
        options = options || {};
        string = utils.trimLeft(string);
        string = utils.parseNewLines(string, options);
        string = utils.parseTicks(string);
        return utils.parseLinks(string, options);
    };

    /**
     *  Normalizes the number of spaces/tabs to multiples of 2 spaces, in the
     *  beginning of each line. Useful for fixing mixed indets of a description
     *  or example.
     *  @memberof docma
     *
     *  @param {String} string
     *         String to process.
     *
     *  @returns {String}
     */
    utils.normalizeTabs = function (string) {
        var m = string.match(/^\s*/gm),
            min = Infinity;

        m.forEach(function (wspace, index) {
            // tabs to spaces
            wspace = wspace.replace(/\t/g, '  ');
            // ignoring first line's indent
            if (index > 0) min = Math.min(wspace.length, min);
        });

        // replace the minimum indent from all lines (except first)
        if (min !== Infinity) {
            var re = new RegExp('^\\s{' + min + '}', 'g');
            string = string.replace(re, '');
        }
        // replace all leading spaces from first line
        string = string.replace(/^\s*/, '');

        var spaces;
        return string.replace(/([\r\n]+)(\s+)/gm, function (match, p1, p2) { // , offset, string
            // convert tabs to spaces
            spaces = p2.replace(/\t/g, '  ');
            // convert indent to multiples of 2
            spaces = new Array(spaces.length - (spaces.length % 2) + 1).join(' ');
            return p1 + spaces;
        });
    };

    /**
     *  Builds a string of keywords from the given symbol.
     *  This is useful for filter/search features of a template.
     *  @memberof docma
     *
     *  @param {Object} symbol - Target documentation symbol.
     *  @returns {String}
     */
    utils.getKeywords = function (symbol) {
        if (typeof symbol === 'string') return symbol.toLowerCase();
        var k = utils.getFullName(symbol) + ' '
            + symbol.longname + ' '
            + symbol.name + ' '
            + (symbol.alias || '') + ' '
            + (symbol.memberOf || '') + ' '
            + (symbol.kind || '') + ' '
            + (symbol.scope || '') + ' '
            + (symbol.classdesc || '') + ' '
            + (symbol.description || '') + ' '
            + (symbol.filename || '') + ' '
            + (symbol.readonly ? 'readonly' : '')
            + (symbol.isEnum ? 'enum' : '');
        if (utils.isConstructor(symbol)) k += ' constructor';
        if (utils.isMethod(symbol)) k += ' method';
        if (utils.isProperty(symbol)) k += ' property';
        return k.replace(/[><"'`\n\r]/g, '').toLowerCase();
    };

    /**
     *  Gets code file information from the given symbol.
     *
     *  @param {Object} symbol - Target documentation symbol.
     *  @returns {Object}
     */
    utils.getCodeFileInfo = function (symbol) {
        return {
            filename: utils.notate(symbol, 'meta.filename'),
            lineno: utils.notate(symbol, 'meta.lineno'),
            path: utils.notate(symbol, 'meta.path')
        };
    };

    // ---------------------------

    utils.listType = function (list) {
        return list.map(function (item) {
            return utils._wrapEscapeCode(item); // '<code>' + item + '</code>';
        }).join(', ');
    };

    utils.listTypeDesc = function (list) {
        if (!list || list.length === 0) return '';
        var desc;
        var pList = list.map(function (item) {
            desc = utils.parse(item.description || '', { keepIfSingle: true });
            if (desc) desc = '&nbsp;&nbsp;—&nbsp;&nbsp;' + desc;
            return utils._wrapEscapeCode(item.type.names.join('|')) + desc; // '<code>' + item.type.names.join('|') + '</code>' + desc;
        });
        if (pList.length > 1) {
            return '<ul>\n' + pList.join('</li>\n<li>') + '\n</ul>';
        }
        return pList; // single item
    };

    // ----------------------
    // PRIVATE
    // ----------------------

    /**
     *  Iterates and gets the first matching item in the array.
     *  @memberof docma
     *  @private
     *
     *  @param {Array} array
     *         Source array.
     *  @param {Object} map
     *         Key/value mapping for the search.
     *
     *  @returns {*} - First matching result. `null` if not found.
     */
    utils._find = function (array, map) {
        // don't type check
        if (!array || !map) return null;
        var i, item,
            found = null;
        for (i = 0; i < array.length; i++) {
            item = array[i];
            if (item && typeof item === 'object') {
                for (var prop in map) {
                    // we also ignore undefined !!!
                    if (map[prop] !== undefined && map.hasOwnProperty(prop)) {
                        if (map[prop] !== item[prop]) {
                            found = null;
                            break;
                        } else {
                            found = item;
                        }
                    }
                }
                if (found) break; // exit
            }
        }
        return found;
    };

    /**
     *  Assignes the source properties to the target object.
     *  @memberof docma
     *  @private
     *
     *  @param {Object} target
     *         Target object.
     *  @param {Object} source
     *         Source object.
     *  @param {Boolean} [enumerable=false]
     *         Whether the assigned properties should be enumerable.
     *
     *  @returns {Object} - Modified target object.
     */
    utils._assign = function (target, source, enumerable) {
        target = target || {};
        var prop;
        for (prop in source) {
            if (source.hasOwnProperty(prop)) {
                if (enumerable) {
                    Object.defineProperty(target, prop, {
                        enumerable: true,
                        value: source[prop]
                    });
                } else {
                    target[prop] = source[prop];
                }
            }
        }
        return target;
    };

    /**
     *  Gets the values of the source object as an `Array`.
     *  @memberof docma
     *  @private
     *
     *  @param {Object} source - Source object.
     *
     *  @returns {Array}
     */
    utils._values = function (source) {
        if (Array.isArray(source)) return source;
        var prop,
            values = [];
        for (prop in source) {
            if (source.hasOwnProperty(prop)) {
                values.push(source[prop]);
            }
        }
        return values;
    };

    /**
     *  Escapes the HTML tags in the given code with entities and wraps the
     *  whole string with `&lt;code&gt;` tags.
     *  @memberof docma
     *  @private
     *
     *  @param {String} code - Code to be processed.
     *  @param {Boolean} [pre=false] - Whether to also wrap the code with
     *         `&lt;pre&gt;` tags.
     *
     *  @returns {String}
     */
    utils._wrapEscapeCode = function (code, pre) {
        code = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        code = '<code>' + code + '</code>';
        return pre ? '<pre>' + code + '</pre>' : code;
    };

    /**
     *  Tokenizes the given string into blocks.
     *  Each block is either a multiline code block (e.g. ```code```) or
     *  regular string block.
     *  @memberof docma
     *  @private
     *
     *  @param {String} string - String to be tokenized.
     *  @param {Function} [callback=_identity] - Function to be executed
     *         on each block. Two arguments are passed; `block`, `isCode`.
     *  @returns {Array}
     *           Array of tokenized blocks.
     */
    utils._tokenize = function (string, callback) {
        if (typeof callback !== 'function') callback = _identity;
        var mark = '```';
        if (string.indexOf(mark) < 0) return [callback(string, false)];
        var i,
            len = mark.length,
            token = '',
            mem = '',
            blocks = [],
            entered = false;
        for (i = 0; i < string.length; i++) {
            token += string[i];
            mem += string[i];
            if (token.length > len) token = token.slice(-len);
            if (token === mark) {
                entered = !entered;
                if (entered) {
                    blocks.push(callback(mem.slice(0, -len), false));
                    mem = token;
                } else {
                    blocks.push(callback(mem, true));
                    mem = '';
                }
            }
        }
        return blocks;
    };

    // ----------------------

    docma.utils = utils;

})();
/* global docma, dust, page, EventEmitter */
/* eslint no-nested-ternary:0 */

// docma.core
// https://github.com/onury/docma

/**
 *  Docma (web) core.
 *
 *  When you build the documentation with a template, `docma-web.js` will be
 *  generated (and linked in the main HTML); which is the core engine for the
 *  documentation web app. This will include everything the app needs such as
 *  the documentation data, compiled partials, dustjs engine, etc...
 *
 *  This object is globally accessible from the generated SPA (Single Page
 *  Application).
 *
 *  Note that the size of this script depends especially on the generated
 *  documentation data.
 *
 *  @type {Object}
 *  @global
 *  @name docma
 */
(function () {

    // Flag for page load. Used for triggering the "ready" event only for page
    // load and not for route changes.
    var _initialLoad = false,
        // app entrance optionally set @ build-time
        _appEntranceRI,
        _arrRouteTypes,
        // flag for app routing method
        PATH_ROUTING = docma.app.routing.method === 'path',
        UNNAMED_API = '_def_',
        utils = docma.utils,
        dom = docma.dom;

    // --------------------------------
    // DEBUG / LOGS
    // --------------------------------

    var _debug = {};
    ['log', 'info', 'warn', 'error'].forEach(function (fn) {
        (function () {
            _debug[fn] = function () {
                if (!docma._.logsEnabled) return;
                console[fn].apply(console, arguments);
            };
        })();
    });

    // --------------------------------
    // DUST FILTERS
    // --------------------------------

    /**
     *  Adds a new Dust filter.
     *  @chainable
     *  @see {@link ?content=docma-filters|Existing Docma (Dust) filters}
     *  @see {@link http://www.dustjs.com/docs/filter-api|Dust Filter API}
     *
     *  @param {String} name
     *         Name of the filter to be added.
     *  @param {Function} fn
     *         Filter function.
     *
     *  @returns {docma} - `docma` for chaining.
     *
     *  @throws {Error} - If a filter with the given name already exists.
     */
    docma.addFilter = function (name, fn) {
        if (docma.filterExists(name)) {
            throw new Error('Filter "' + name + '" already exists.');
        }
        dust.filters[name] = fn;
        return docma;
    };

    /**
     *  Removes an existing Dust filter.
     *  @chainable
     *
     *  @param {String} name - Name of the filter to be removed.
     *
     *  @returns {docma} - `docma` for chaining.
     */
    docma.removeFilter = function (name) {
        delete dust.filters[name];
        return docma;
    };

    /**
     *  Checks whether a Dust filter with the given name already exists.
     *
     *  @param {String} name - Name of the filter to be checked.
     *
     *  @returns {Boolean}
     */
    docma.filterExists = function (name) {
        return typeof dust.filters[name] === 'function';
    };

    // --------------------------------
    // EVENTS
    // --------------------------------

    /**
     *  @private
     */
    var _emitter = new EventEmitter();

    function _trigger(eventName, args) {
        _debug.info('Event:', eventName, args ? args[0] : '');
        _emitter.trigger(eventName, args);
    }

    /**
     *  Docma SPA events enumeration.
     *  @enum {String}
     */
    docma.Event = {
        /**
         *  Emitted when Docma is ready and the initial content is rendered.
         *  @type {String}
         */
        Ready: 'ready',
        /**
         *  Emitted when page content (a Dust partial) is rendered.
         *  @type {String}
         */
        Render: 'render',
        /**
         *  Emitted when SPA route is changed.
         *  @type {String}
         */
        Route: 'route'
    };

    /**
     *  Adds a listener function to the specified event.
     *  Note that the listener will not be added if it is a duplicate.
     *  If the listener returns true then it will be removed after it is called.
     *  @alias docma.addListener
     *  @chainable
     *
     *  @param {String} eventName
     *         Name of the event to attach the listener to.
     *         See {@link #docma.Event|`docma.Event`} enumeration.
     *  @param {Function} listener
     *         Function to be called when the event is emitted. If the function
     *         returns true then it will be removed after calling.
     *
     *  @returns {docma} - `docma` for chaining.
     *
     *  @example
     *  docma.on('render', function (currentRoute) {
     *  	if (!currentRoute) {
     *  		console.log('Not found!');
     *  		return;
     *  	}
     *  	if (currentRoute.type === docma.Route.Type.API) {
     *  		console.log('This is an API route.')
     *  	}
     *  });
     */
    docma.on = function (eventName, listener) { // eslint-disable-line
        _emitter.on.apply(_emitter, arguments);
        return docma;
    };

    /**
     *  Adds a listener that will be automatically removed after its first
     *  execution.
     *  @alias docma.addOnceListener
     *  @chainable
     *
     *  @param {String} eventName
     *         Name of the event to attach the listener to.
     *         See {@link #docma.Event|`docma.Event`} enumeration.
     *  @param {Function} listener
     *         Function to be called when the event is emitted.
     *
     *  @returns {docma} - `docma` for chaining.
     *
     *  @example
     *  docma.once('ready', function () {
     *  	console.log('Docma is ready!');
     *  });
     */
    docma.once = function () {
        _emitter.once.apply(_emitter, arguments);
        return docma;
    };

    /**
     *  Removes the given listener from the specified event.
     *  @alias docma.removeListener
     *  @chainable
     *
     *  @param {String} eventName
     *         Name of the event to remove the listener from.
     *         See {@link #docma.Event|`docma.Event`} enumeration.
     *  @param {Function} listener
     *         Function to be removed from the event.
     *
     *  @returns {docma} - `docma` for chaining.
     */
    docma.off = function () {
        _emitter.off.apply(_emitter, arguments);
        return docma;
    };

    /**
     *  Alias for `docma.on`
     *  @private
     */
    docma.addListener = docma.on;
    /**
     *  Alias for `docma.once`
     *  @private
     */
    docma.addListenerOnce = docma.once;
    /**
     *  Alias for `docma.off`
     *  @private
     */
    docma.removeListener = docma.off;

    // --------------------------------
    // DOCMA STATE
    // --------------------------------

    /**
     *  Gets the route information for the current rendered content being
     *  displayed.
     *
     *  @name docma.currentRoute
     *  @type {Route}
     *  @readonly
     *
     *  @property {String} type
     *            Type of the current route. If a generated JSDoc API
     *            documentation is being displayed, this is set to `"api"`.
     *            If any other HTML content (such as a converted markdown) is
     *            being displayed; this is set to `"content"`.
     *  @property {String} name
     *            Name of the current route. For `api` routes, this is the name
     *            of the grouped JS files parsed. If no name is given, this is
     *            set to `"_def_"` by default. For `content` routes, this is
     *            either the custom name given at build-time or, by default; the
     *            name of the generated HTML file; lower-cased, without the
     *            extension. e.g. `"README.md"` will have the route name
     *            `"readme"` after the build.
     *  @property {String} path
     *            Path of the current route.
     */
    Object.defineProperty(docma, 'currentRoute', {
        configurable: false,
        get: function () {
            return docma._.currentRoute;
        }
    });

    /**
     *	JSDoc documentation data for the current API route.
     *	If current route is not an API route, this will be `null`.
     *
     *  See {@link ?api=docma#Docma~BuildConfiguration|build configuration} for more
     *  details on how Javascript files can be grouped (and named) to form
     *  separate API documentations and SPA routes.
     *
     *  @name docma.documentation
     *  @type {Array}
     *
     *  @example
     *  // output current API documentation data
     *  if (docma.currentRoute.type === 'api') {
     *  	console.log(docma.documentation);
     *  }
     *
     *  @example
     *  <!-- Usage in (Dust) partial -->
     *  {#documentation}
     *      <h4>{longname}</h4>
     *      <p>{description}</p>
     *      <hr />
     *  {/documentation}
     */
    Object.defineProperty(docma, 'documentation', {
        configurable: false,
        get: function () {
            return docma._.documentation;
        }
    });

    /**
     *	A flat array of JSDoc documentation symbol names. This is useful for
     *	building menus, etc... If current route is not an API route, this will
     *	be `null`.
     *
     *  See {@link ?api=docma#Docma~BuildConfiguration|build configuration} for more
     *  details on how Javascript files can be grouped (and named) to form
     *  separate API documentations and SPA routes.
     *
     *  @name docma.symbols
     *  @type {Array}

     *  @example
     *  <!-- Usage in (Dust) partial -->
     *  <ul class="menu">
     *      {#symbols}
     *          <li><a href="#{.}">{.}</a></li>
     *      {/symbols}
     *  </ul>
     */
    Object.defineProperty(docma, 'symbols', {
        configurable: false,
        get: function () {
            return docma._.symbols;
        }
    });

    // --------------------------------
    // CLASS: Docma.Route
    // --------------------------------

    /**
     *  Creates SPA route information object for the given route name and type.
     *  @class
     *  @memberof docma
     *
     *  @param {String} name
     *         Name of the route.
     *  @param {String} type
     *         Type of the SPA route. See {@link #docma.Route.Type|`Route.Type`}
     *         enumeration for possible values.
     */
    function Route(name, type) {
        if (!type || _arrRouteTypes.indexOf(type) < 0) return; // 404

        if (!name) {
            if (type !== Route.Type.API) return; // 404
            name = UNNAMED_API;
        } else {
            if (!docma.app.routing.caseSensitive) name = name.toLowerCase();
        }

        // `docma.routes` array is created @ build-time. If no route is found;
        // this will create a `Route` instance but it will be equivalent to 404
        // route. No properties such as `id`, `name`, `type` and `path`.

        // search in existing routes.
        var info = utils._find(docma.routes, {
            type: type,
            name: name
        });
        // if found, assign properties `id`, `name`, `type` and `path`.
        if (info) utils._assign(this, info);
    }

    /**
     *  Docma SPA route types enumeration.
     *  @memberof docma
     *  @enum {String}
     *  @readonly
     *
     *  @example
     *  // docma.app.routing.method = "query"
     *  type     name              path
     *  -------  ----------------  --------------------------
     *  api      _def_             /?api
     *  api      docma-web         /?api=docma-web
     *  content  templates         /?content=templates
     *  content  guide             /?content=guide
     *
     *  @example
     *  // docma.app.routing.method = "path"
     *  type     name              path
     *  -------  ----------------  --------------------------
     *  api      _def_             /api
     *  api      docma-web         /api/docma-web
     *  content  templates         /templates
     *  content  guide             /guide
     *
     */
    Route.Type = {
        /**
         *  Indicates that the route is for API documentation content.
         *  @type {String}
         */
        API: 'api',
        /**
         *  Indicates that the route is for other content, such as HTML files
         *  generated from markdown.
         *  @type {String}
         */
        CONTENT: 'content'
    };
    _arrRouteTypes = utils._values(Route.Type);

    /**
     *  Checks whether the route actually exists.
     *  @memberof docma
     *
     *  @returns {Boolean}
     */
    Route.prototype.exists = function () {
        return Boolean(this.id);
    };

    /**
     *  Checks whether the route is equal to the given route.
     *  @memberof docma
     *
     *  @param {Route} routeInfo - Route to be checked against.
     *  @returns {Boolean}
     */
    Route.prototype.isEqualTo = function (routeInfo) {
        if (!routeInfo || !routeInfo.exists() || !this.exists()) return false;
        return routeInfo.path === this.path;
    };

    /**
     *  Checks whether the route is currently being viewed.
     *  @memberof docma
     *
     *  @param {Object} routeInfo - Object to be checked.
     *  @returns {Boolean}
     */
    Route.prototype.isCurrent = function () {
        return this.isEqualTo(docma.currentRoute);
    };

    /**
     *  Applies the route to the application.
     *  @memberof docma
     *
     *  @returns {Route} - The route instance for chaining.
     */
    Route.prototype.apply = function () {
        if (this.type === Route.Type.API) {
            docma._.documentation = docma.apis[this.name].documentation;
            docma._.symbols = docma.apis[this.name].symbols;
        } else {
            // reset documentation & symbols since this is not an API route
            docma._.documentation = null;
            docma._.symbols = null;
        }
        // _debug.log('Route Info:', this.toString());
        _trigger(docma.Event.Route, [this]);
        docma.render(this);
        return this;
    };

    /**
     *  Gets the string representation of the route.
     *  @memberof docma
     *
     *  @returns {String}
     */
    Route.prototype.toString = function () {
        return JSON.stringify(this);
    };

    /**
     *  Creates a new Route instance. This is equivalent to `new docma.Route()`.
     *  @memberof docma
     *
     *  @param {String} name
     *         Name of the route.
     *  @param {String} type
     *         Type of the SPA route. See {@link #docma.Route.Type|`Route.Type`}
     *         enumeration for possible values.
     *
     *  @returns {Route} - Route instance.
     */
    Route.create = function (name, type) {
        return new Route(name, type);
    };

    /**
     *  Get route information object from the given route ID.
     *  @memberof docma
     *  @private
     *
     *  @param {String} id
     *         ID of the route (in `type:name` format).
     *  @param {Boolean} [force=false]
     *         Whether to return the first route in available routes, if there
     *         is no match.
     *
     *  @returns {Route} - Route instance.
     */
    Route.fromID = function (id) {
        if (typeof id !== 'string') {
            _debug.warn('Route ID is not a string: ' + id);
            return new Route(null);
        }
        var s = id.split(':');
        return new Route(s[1], s[0]); // name, type
    };

    /**
     *  Get route information object from the given query-string.
     *  @memberof docma
     *  @private
     *
     *  @param {String} querystring - Query-string.
     *
     *  @returns {Route} - Route instance.
     */
    Route.fromQuery = function (querystring) {
        if (!querystring) return new Route(null);
        // get the first key=value pair
        var query = querystring.split('&')[0].split('='),
            routeType = query[0].toLowerCase(), // "api" or "content"
            routeName = query[1];

        // if (!docma.app.routing.caseSensitive) routeName = (routeName || '').toLowerCase();
        // routeName = routeName || UNNAMED_API;
        //
        // // return if invalid route type
        // if (_arrRouteTypes.indexOf(routeType) < 0) return new Route(null);
        //
        // if (!routeName) {
        //     if (routeType === Route.Type.API) routeName = UNNAMED_API;
        // }

        return new Route(routeName, routeType);
    };

    /**
     *  @ignore
     */
    Object.defineProperty(docma, 'Route', {
        configurable: false,
        get: function () {
            return Route;
        }
    });

    // --------------------------------
    // RENDER
    // --------------------------------

    /**
     *  Renders the given Dust template into the docma main element.
     *  @private
     *
     *  @param {String} dustTemplateName
     *         Name of the Dust template.
     *  @param {Function} [callback]
     *         Function to be executed when the rendering is complete.
     */
    function _render(dustTemplateName, callback) {
        // render docma main template
        dust.render(dustTemplateName, docma, function (err, compiledHTML) {
            if (err) throw err;
            dom.loadCompiledContent(compiledHTML);
            if (typeof callback === 'function') callback();
        });
    }

    /**
     *  Triggers "render" event and checks if now is the time to also trigger
     *  "ready" event.
     *  @private
     */
    function _triggerAfterRender() {
        _trigger(docma.Event.Render, [docma.currentRoute]);
        if (_initialLoad) {
            _trigger(docma.Event.Ready);
            _initialLoad = false;
        }
    }

    /**
     *  Renders docma-404 partial. Used for not-found routes.
     *  @private
     *
     *  @param {Function} statusCallback -
     */
    function _render404(routeInfo, statusCallback) {
        docma._.currentRoute = Route.create(null);
        _render(docma._.partials.notFound, function () {
            _trigger(docma.Event.Render, [null]);
            dom.scrollTo();
            if (typeof statusCallback === 'function') return statusCallback(404);
            // no callback, throw...
            throw new Error('Page or content not found for route: ' + JSON.stringify(routeInfo));
        });
    }

    /**
     *  Asynchronously fetches (text) content from the given URL via an
     *  `XmlHttpRequest`. Note that the URL has to be in the same-origin, for
     *  this to work.
     *
     *  @param {String} url
     *         URL to be fetched.
     *  @param {Function} callback
     *         Function to be executed when the content is fetched; with the
     *         following signature: `function (status, responseText) { .. }`
     */
    docma.fetch = function (url, callback) {
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                var text = xhr.status === 200 ? xhr.responseText : '';
                _debug.log('XHR GET:', xhr.status, url);
                return callback(xhr.status, text);
            }
        };
        xhr.open('GET', url, true); // async
        xhr.send();
    };

    /**
     *  Renders content into docma-main element, by the given route information.
     *
     *  If the content is empty or `"api"`, we'll render the `docma-api`
     *  Dust template. Otherwise, (e.g. `"readme"`) we'll render `docma-content`
     *  Dust template, then  fetch `content/readme.html` and load it in the
     *  `docma-main` element.
     *
     *  Note that rendering and the callback will be cancelled if the given
     *  content is the latest content rendered.
     *
     *  @param {Route} routeInfo
     *         Route information of the page to be rendered.
     *  @param {Function} [callback]
     *         Function to be executed when the rendering is complete.
     *         `function (httpStatus:Number) { .. }`
     *
     *  @emits docma.Event.Render
     */
    docma.render = function (routeInfo, callback) {
        // if no route info, render not-found partial (docma-404)
        if (!routeInfo || !routeInfo.exists()) return _render404(routeInfo, callback);
        // return if same route
        if (routeInfo.isEqualTo(docma.currentRoute)) return;
        // set current route
        docma._.currentRoute = routeInfo;

        var isCbFn = typeof callback === 'function';

        if (routeInfo.type === Route.Type.API) {
            _render(docma._.partials.api, function () {
                _triggerAfterRender();
                if (isCbFn) callback(200);
                dom.fixAnchors();
                dom.scrollTo();
            });
        } else { // if (routeInfo.type === Route.Type.CONTENT) {
            docma.fetch(routeInfo.contentPath, function (status, html) {
                if (status === 404) return _render404(routeInfo, callback);
                // rendering docma-content Dust template
                _render(docma._.partials.content, function () {
                    dom.loadContent(html);
                    _triggerAfterRender();
                    if (isCbFn) callback(status);
                    dom.fixAnchors();
                });
            });
        }
    };

    // --------------------------------
    // ROUTING with (page.js)
    // --------------------------------

    /**
     *  This is used for "path" routing method.
     *  i.e. docma.app.routing.method = "path" and docma.app.server === "github"
     *  or none
     *
     *  In this case, Docma generates directories with an index file for each
     *  route. Index files will set a redirect path to sessionStorage and
     *  meta-refresh itself to main (root) index file.
     *
     *  Then we'll read the redirect path from `sessionStorage` into memory and
     *  reset the storage. Then redirect the SPA to the set path.
     *
     *  Note that if `.app.routing.method` is set to `"query"`, we don't need
     *  this since, routing via query-string always operates on the main page
     *  already.
     *  @private
     *
     *  @returns {Boolean} - Whether the SPA is redirecting from a
     *  sub-directory path.
     */
    function _redirecting() {
        if (PATH_ROUTING) {
            var redirectPath = sessionStorage.getItem('redirectPath') || null;
            if (redirectPath) {
                sessionStorage.removeItem('redirectPath');
                _debug.info('Redirecting to:', redirectPath);
                page.redirect(redirectPath);
                return true;
            }
        }
        return false;
    }

    function _getQueryString(ctxQueryString) {
        var qs = ctxQueryString || window.location.search;
        // remove leading ? or & if any
        if ((/^[?&]/).test(qs)) qs = qs.slice(1);
        return qs || null;
    }

    // Setup page.js routes

    // if routing method is "path"; e.g. for `/guide` we render `docma-content`
    // Dust template, then fetch `content/guide.html` and load it in the
    // docma-main element. Otherwise, we'll render `docma-api` Dust
    // template. (_def_) API documentation will be accessible @ `/api`.
    // Named API documentation will be accessible @ `/api/name`.

    // if routing method is "query"; we look for query-string param "api" or
    // "content". e.g. for `?content=readme` we render `docma-content` Dust
    // template, then fetch `content/readme.html` and load it in the docma-main
    // element. e.g. "?api=mylib", we'll render `docma-api` Dust template.

    if (docma.app.base) page.base(docma.app.base);
    page.redirect('(/)?' + docma.template.main, '');

    if (PATH_ROUTING) {
        page('(/)?api/:apiName?', function (context, next) {
            // console.log(context);
            var apiName = context.params.apiName || UNNAMED_API,
                routeInfo = Route.create(apiName, Route.Type.API);
            // route not found, send to next (not-found)
            if (!routeInfo || !routeInfo.exists()) return next();
            routeInfo.apply();
        });

        page('(/)?:content', function (context, next) {
            // console.log(context);
            var content = context.params.content,
                routeInfo = Route.create(content, Route.Type.CONTENT);
            // route not found, send to next (not-found)
            if (!routeInfo || !routeInfo.exists()) return next();
            routeInfo.apply();
        });
    }

    page('(/)?', function (context, next) {
        if (_redirecting()) return;
        // _debug.log(context);

        // context.querystring has problems.
        // See our issue @ https://github.com/visionmedia/page.js/issues/377
        // So first, we check if context.querystring has a value. if not, we'll
        // try window.location.search but, it needs a little delay to capture
        // the change.
        setTimeout(function () {
            var routeInfo,
                qs = _getQueryString(context.querystring); // this needs the timeout

            if (PATH_ROUTING) {
                // only expecting paths, shouldn't have querystring
                if (qs) return next(); // not found
                // no query-string, just "/" root received
                routeInfo = _appEntranceRI;
            } else { // query routing
                _debug.log('Query-string:', qs);
                routeInfo = qs ? Route.fromQuery(qs) : _appEntranceRI;
            }

            // route not found, send to next (not-found)
            if (!routeInfo || !routeInfo.exists()) return next();

            // if this is already the current route, do nothing...
            if (routeInfo.isCurrent()) return;

            // now, we can apply the route
            routeInfo.apply();

        }, 100);
    });

    page('*', function (context) { // (context, next)
        _debug.warn('Unknown Route:', context.path);
        Route.create(null).apply();
    });

    // --------------------------------
    // INITIALIZE
    // --------------------------------

    _debug.info('Docma SPA Configuration:');
    _debug.info('App Title:          ', docma.app.title);
    _debug.info('Routing Method:     ', docma.app.routing.method);
    _debug.info('App Server:         ', docma.app.server);
    _debug.info('Base Path:          ', docma.app.base);
    _debug.info('Entrance Route ID:  ', docma.app.entrance);

    window.onload = function () { // (event)

        // mark initial page load
        _initialLoad = true;
        // convert entrance route ID to routeInfo for later use
        _appEntranceRI = Route.fromID(docma.app.entrance);
        // configure page.js
        page.start({
            click: true,
            popstate: true,
            dispatch: true,
            hashbang: false,
            decodeURLComponents: true
        });

        _debug.info('Docma SPA loaded!');
    };

})();

// --------------------------------
// ADDITIONAL DOCUMENTATION
// --------------------------------

/**
 *  Provides configuration data of the generated SPA, which is originally set
 *  at build-time, by the user.
 *  See {@link ?api=docma#Docma~BuildConfiguration|build configuration} for more
 *  details on how these settings take affect.
 *  @name docma.app
 *  @type {Object}
 *
 *  @property {String} title
 *            Document title for the main file of the generated app.
 *            (Value of the `&lt;title/>` tag.)
 *  @property {Array} meta
 *            Array of arbitrary objects set for main document meta (tags).
 *  @property {String} base
 *            Base path of the generated web app.
 *  @property {String} entrance
 *            Name of the initial content displayed, when the web app is first
 *            loaded.
 *  @property {String|Object} routing
 *            Routing settings for the generated SPA.
 *  @property {String} server
 *            Server/host type of the generated SPA.
 */

/**
 *	Hash-map of JSDoc documentation outputs.
 *	Each key is the name of an API (formed by grouped Javascript files).
 *	e.g. `docma.apis["some-api"]`
 *
 *  Unnamed documentation data (consisting of ungrouped Javascript files) can be
 *  accessed via `docma.apis._def_`.
 *
 *	Each value is an `Object` with the following signature:
 *	`{ documentation:Array, symbols:Array }`. `documentation` is the actual
 *	JSDoc data, and `symbols` is a flat array of symbol names.
 *
 *  See {@link ?api=docma#Docma~BuildConfiguration|build configuration} for more
 *  details on how Javascript files can be grouped (and named) to form separate
 *  API documentations and SPA routes.
 *
 *  @name docma.apis
 *  @type {Object}
 *
 *  @example
 *  // output ungrouped (unnamed) API documentation data
 *  console.log(docma.apis._def_.documentation);
 *  console.log(docma.apis._def_.symbols); // flat list of symbol names
 *  // output one of the grouped (named) API documentation data
 *  console.log(docma.apis['my-scondary-api'].documentation);
 *
 *  @example
 *  <!-- Usage in a Dust partial
 *  	Each API data is passed to the partial, according to the route.
 *  	So you'll always use `documentation` within the partials.
 *  -->
 *  {#documentation}
 *      <h4>{longname}</h4>
 *      <p>{description}</p>
 *      <hr />
 *  {/documentation}
 */

/**
 *  Array of available SPA routes of the documentation.
 *  This is created at build-time and defined via the `src` param of the
 *  {@link ?api=docma#Docma~BuildConfiguration|build configuration}.
 *
 *  @name docma.routes
 *  @type {Array}
 *
 *  @see {@link #docma.Route|docma.Route}
 */

/**
 *  Provides template specific configuration data.
 *  This is also useful within the Dust partials of the Docma template.
 *  @name docma.template
 *  @type {Object}
 *
 *  @property {Object} options - Docma template options. Defined at build-time,
 *  by the user.
 *  @property {String} name
 *            Name of the Docma template.
 *  @property {String} version
 *            Version of the Docma template.
 *  @property {String} author
 *            Author information for the Docma template.
 *  @property {String} license
 *            License information for the Docma template.
 *  @property {String} main
 *            Name of the main file of the template. i.e. `index.html`
 *
 *  @example
 *  <!-- Usage in a Dust partial -->
 *  <div>
 *      {?template.options.someOption}
 *      <span>Displayed if someOption is true.</span>
 *      {/template.options.someOption}
 *  </div>
 *  <div class="footer">{template.name} by {template.author}</div>
 */

 /**
  *  Utilities for inspecting JSDoc documentation and symbols; and parsing
  *  documentation data into proper HTML.
  *  See {@link ?api=docma-web-utils|`docma.utils` documentation}.
  *  @name docma.utils
  *  @type {Object}
  *  @namespace
  */

docma = Object.freeze(docma);