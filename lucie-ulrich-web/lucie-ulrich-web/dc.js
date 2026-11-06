/* Tiny runtime for the exported interactive pages (holes, sc-if, events). */
(function () {
  'use strict';
  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  function get(vals, path) {
    var parts = path.split('.'), v = vals;
    for (var i = 0; i < parts.length; i++) { if (v == null) return undefined; v = v[parts[i]]; }
    return v;
  }
  function fill(str, vals) {
    return str.replace(HOLE, function (_, p) { var v = get(vals, p); return v == null || v === false ? '' : String(v); });
  }
  var EVENTS = { onclick: 'click', onchange: 'input', oninput: 'input', onsubmit: 'submit', onkeydown: 'keydown', onfocus: 'focus', onblur: 'blur', onmouseenter: 'mouseenter', onmouseleave: 'mouseleave', onpointerdown: 'pointerdown' };

  window.DCLogic = function DCLogic(props) { this.props = props || {}; this.state = {}; };
  window.DCLogic.prototype.setState = function (u) {
    var n = typeof u === 'function' ? u(this.state, this.props) : u;
    this.state = Object.assign({}, this.state, n);
    if (this.__schedule) this.__schedule();
  };

  function compile(node, ctx, bindings) {
    var kids = Array.prototype.slice.call(node.childNodes);
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k.nodeType === 3) {
        if (HOLE.test(k.nodeValue)) {
          HOLE.lastIndex = 0;
          (function (t, src) { bindings.push(function (v) { var s = fill(src, v); if (t.nodeValue !== s) t.nodeValue = s; }); })(k, k.nodeValue);
        }
        HOLE.lastIndex = 0;
      } else if (k.nodeType === 1) {
        if (k.localName === 'sc-if') { compileIf(k, ctx, bindings); continue; }
        var attrs = Array.prototype.slice.call(k.attributes);
        for (var j = 0; j < attrs.length; j++) {
          var a = attrs[j], name = a.name, val = a.value;
          if (name === 'hint-placeholder-val') { k.removeAttribute(name); continue; }
          if (EVENTS[name]) {
            k.removeAttribute(name);
            var m = /\{\{\s*([^}]+?)\s*\}\}/.exec(val);
            if (m) (function (el, ev, key) {
              el.addEventListener(ev, function (e) { var fn = get(ctx.vals, key); if (typeof fn === 'function') fn(e); });
            })(k, EVENTS[name], m[1]);
            continue;
          }
          if (val.indexOf('{{') > -1) {
            (function (el, n, src) {
              bindings.push(function (v) {
                var s = fill(src, v);
                if (el.getAttribute(n) !== s) el.setAttribute(n, s);
                if (n === 'value' && 'value' in el && el.value !== s && document.activeElement !== el) el.value = s;
                if (n === 'checked') el.checked = !!get(v, /\{\{\s*([^}]+?)\s*\}\}/.exec(src)[1]);
              });
            })(k, name, val);
          }
        }
        if (k.localName !== 'template') compile(k, ctx, bindings);
      }
    }
  }

  function compileIf(el, ctx, bindings) {
    var key = (/\{\{\s*([^}]+?)\s*\}\}/.exec(el.getAttribute('value') || '') || [])[1];
    var frag = document.createDocumentFragment();
    while (el.firstChild) frag.appendChild(el.firstChild);
    var anchor = document.createComment('if ' + key);
    el.parentNode.replaceChild(anchor, el);
    var mounted = null, inner = [];
    bindings.push(function (v) {
      var on = !!get(v, key);
      if (on && !mounted) {
        var c = frag.cloneNode(true); inner = [];
        compile(c, ctx, inner);
        mounted = Array.prototype.slice.call(c.childNodes);
        anchor.parentNode.insertBefore(c, anchor.nextSibling);
      } else if (!on && mounted) {
        mounted.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
        mounted = null; inner = [];
      }
      for (var i = 0; i < inner.length; i++) inner[i](v);
    });
  }

  window.DC = {
    mount: function (Component, rootSel, tplSel) {
      var root = document.querySelector(rootSel || '#dc-root');
      var tpl = document.querySelector(tplSel || '#dc-tpl');
      var comp = new Component({});
      var ctx = { vals: {} }, bindings = [], queued = false;
      function render() {
        queued = false;
        ctx.vals = comp.renderVals ? (comp.renderVals() || {}) : {};
        for (var i = 0; i < bindings.length; i++) bindings[i](ctx.vals);
      }
      comp.__schedule = function () { if (!queued) { queued = true; (window.queueMicrotask || setTimeout)(render); } };
      var frag = tpl.content.cloneNode(true);
      compile(frag, ctx, bindings);
      ctx.vals = comp.renderVals ? (comp.renderVals() || {}) : {};
      for (var i = 0; i < bindings.length; i++) bindings[i](ctx.vals);
      root.innerHTML = '';
      root.appendChild(frag);
      if (comp.componentDidMount) comp.componentDidMount();
      window.addEventListener('pagehide', function () { if (comp.componentWillUnmount) comp.componentWillUnmount(); });
      return comp;
    }
  };
})();
