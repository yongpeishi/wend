/* @ds-bundle: {"format":4,"namespace":"WendDesignSystem_c7e2ae","components":[{"name":"Logo","sourcePath":"components/brand/Logo.jsx"},{"name":"Placeholder","sourcePath":"components/brand/Placeholder.jsx"},{"name":"Trail","sourcePath":"components/brand/Trail.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Chip","sourcePath":"components/core/Chip.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"KeepToggle","sourcePath":"components/core/KeepToggle.jsx"},{"name":"Label","sourcePath":"components/core/Label.jsx"},{"name":"PlaceCard","sourcePath":"components/travel/PlaceCard.jsx"},{"name":"TimeRow","sourcePath":"components/travel/TimeRow.jsx"}],"sourceHashes":{"components/brand/Logo.jsx":"3394972ce4c0","components/brand/Placeholder.jsx":"df64a99f0de9","components/brand/Trail.jsx":"e04f68718bfb","components/core/Button.jsx":"c55dda00ba0d","components/core/Card.jsx":"930daaead110","components/core/Chip.jsx":"0b725f140c89","components/core/Input.jsx":"2c91f21d837f","components/core/KeepToggle.jsx":"c3b9ac845fe5","components/core/Label.jsx":"0ef89fe0b1b1","components/travel/PlaceCard.jsx":"fdf8bdccb4f1","components/travel/TimeRow.jsx":"d0602ffe9fdd","ui_kits/roadbook/DaysScreen.jsx":"59fb8c6d2bb6","ui_kits/roadbook/KeptScreen.jsx":"97f5c3f9d740","ui_kits/roadbook/Phone.jsx":"42bf724d45b0","ui_kits/roadbook/TodayScreen.jsx":"5d1fd81f1c2b","ui_kits/roadbook/data.js":"daf089a1a6ef"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.WendDesignSystem_c7e2ae = window.WendDesignSystem_c7e2ae || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/brand/Logo.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Logo({
  variant = 'primary',
  size = 40,
  showWordmark = true,
  ...rest
}) {
  const trail = variant === 'reversed' ? 'var(--trail-line-on-dark)' : 'var(--stop-decided)';
  const open = variant === 'reversed' ? 'var(--surface-inverse)' : 'var(--surface-page)';
  const start = variant === 'reversed' ? 'var(--text-on-dark)' : 'var(--stop-decided)';
  const end = variant === 'reversed' ? 'var(--wend-plum-tint)' : 'var(--stop-destination)';
  const word = variant === 'reversed' ? 'var(--text-on-dark)' : 'var(--text-strong)';
  const small = size <= 28;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: size * 0.36
    }
  }, rest), /*#__PURE__*/React.createElement("svg", {
    width: size * 1.33,
    height: size,
    viewBox: "0 0 96 72",
    fill: "none",
    role: "img",
    "aria-label": "Wend",
    style: {
      display: 'block'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M10 60 C 10 34, 44 46, 44 26 C 44 10, 74 12, 82 30",
    stroke: trail,
    strokeWidth: small ? 5 : 3,
    strokeLinecap: "round",
    strokeDasharray: small ? '1 7' : '1 8'
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "10",
    cy: "60",
    r: small ? 9 : 7,
    fill: start
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "44",
    cy: "26",
    r: small ? 11 : 9,
    fill: open,
    stroke: "var(--stop-open)",
    strokeWidth: small ? 5 : 3.5
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "82",
    cy: "30",
    r: small ? 8 : 6,
    fill: end
  })), showWordmark && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontWeight: 'var(--weight-bold)',
      fontSize: size * 0.72,
      letterSpacing: 'var(--wordmark-tracking)',
      textTransform: 'uppercase',
      color: word,
      lineHeight: 1,
      display: 'inline-block',
      paddingLeft: size * 0.06
    }
  }, "Wend"));
}
Object.assign(__ds_scope, { Logo });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/Logo.jsx", error: String((e && e.message) || e) }); }

// components/brand/Placeholder.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Placeholder({
  height = 120,
  radius = 'media',
  caption,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      height,
      background: 'var(--placeholder-hatch)',
      borderRadius: radius === 'card' ? 'var(--radius-card)' : radius === 'none' ? 0 : 'var(--radius-media)',
      display: 'flex',
      alignItems: 'flex-end',
      padding: 'var(--space-2)',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-code-size)',
      color: 'var(--text-muted)',
      ...style
    }
  }, rest), caption);
}
Object.assign(__ds_scope, { Placeholder });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/Placeholder.jsx", error: String((e && e.message) || e) }); }

// components/brand/Trail.jsx
try { (() => {
const PRESET = {
  decided: {
    d: 14,
    fill: 'var(--stop-decided)',
    border: 'none'
  },
  open: {
    d: 16,
    fill: 'transparent',
    border: '3.5px solid var(--stop-open)'
  },
  waiting: {
    d: 10,
    fill: 'var(--stop-waiting)',
    border: 'none'
  },
  destination: {
    d: 12,
    fill: 'var(--stop-destination)',
    border: 'none'
  }
};
function Trail({
  stops = [],
  labels,
  onDark = false,
  height = 46,
  ...rest
}) {
  const n = Math.max(stops.length, 2);
  const fx = i => 6 + i * (88 / (n - 1));
  const fy = i => i % 2 === 0 ? 0.7 : 0.3;
  const pts = stops.map((s, i) => ({
    x: fx(i) / 100 * 300,
    y: fy(i) * height,
    state: s
  }));
  const d = pts.reduce((acc, p, i) => {
    if (i === 0) return `M${p.x} ${p.y}`;
    const prev = pts[i - 1];
    const mx = (prev.x + p.x) / 2;
    return `${acc} C ${mx} ${prev.y}, ${mx} ${p.y}, ${p.x} ${p.y}`;
  }, '');
  return /*#__PURE__*/React.createElement("div", rest, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      height,
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "100%",
    height: height,
    viewBox: `0 0 300 ${height}`,
    preserveAspectRatio: "none",
    fill: "none",
    "aria-hidden": "true",
    style: {
      display: 'block'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: d,
    stroke: onDark ? 'var(--trail-line-on-dark)' : 'var(--trail-line)',
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeDasharray: "1 7",
    vectorEffect: "non-scaling-stroke"
  })), stops.map((s, i) => {
    const p = PRESET[s] || PRESET.waiting;
    return /*#__PURE__*/React.createElement("span", {
      key: i,
      style: {
        position: 'absolute',
        left: `${fx(i)}%`,
        top: fy(i) * height,
        transform: 'translate(-50%, -50%)',
        width: p.d,
        height: p.d,
        borderRadius: '50%',
        boxSizing: 'border-box',
        background: p.fill === 'transparent' ? onDark ? 'var(--surface-inverse)' : 'var(--surface-card)' : p.fill,
        border: p.border
      }
    });
  })), labels && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginTop: 'var(--space-3)'
    }
  }, labels.map((l, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      fontFamily: 'var(--font-sans)',
      fontWeight: 'var(--weight-bold)',
      fontSize: 'var(--text-label-size)',
      letterSpacing: 'var(--text-label-tracking)',
      textTransform: 'uppercase',
      color: stops[i] === 'waiting' ? onDark ? 'var(--text-on-dark-muted)' : 'var(--text-muted)' : onDark ? 'var(--text-on-dark)' : 'var(--text-strong)'
    }
  }, l))));
}
Object.assign(__ds_scope, { Trail });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/Trail.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Button({
  variant = 'primary',
  disabled = false,
  focused = false,
  children,
  ...rest
}) {
  const base = {
    fontFamily: 'var(--font-sans)',
    fontWeight: 'var(--weight-bold)',
    fontSize: 'var(--text-small-size)',
    minHeight: 'var(--tap-min)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: disabled ? 'default' : 'pointer',
    border: 'none',
    boxShadow: 'var(--shadow-none)',
    transition: 'opacity var(--motion-fade-duration) var(--motion-fade-ease)',
    outline: focused ? 'var(--focus-width) solid var(--focus-ring)' : 'none',
    outlineOffset: 'var(--focus-offset)'
  };
  const styles = {
    primary: {
      background: disabled ? 'var(--surface-disabled)' : 'var(--action-primary)',
      color: disabled ? 'var(--action-disabled-text)' : 'var(--action-primary-text)',
      padding: '14px 26px',
      borderRadius: 'var(--radius-card)'
    },
    secondary: {
      background: 'transparent',
      color: 'var(--text-strong)',
      padding: '12px 24px',
      borderRadius: 'var(--radius-card)',
      border: 'var(--border-width-strong) solid var(--action-primary)'
    },
    quiet: {
      background: 'transparent',
      color: 'var(--action-primary)',
      padding: '12px 4px',
      borderRadius: 0,
      borderBottom: 'var(--border-width-strong) solid var(--action-primary)'
    },
    onDark: {
      background: 'transparent',
      color: 'var(--text-on-dark)',
      padding: '12px 24px',
      borderRadius: 'var(--radius-card)',
      border: 'var(--border-width-strong) solid var(--wend-leaf-soft)'
    }
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    disabled: disabled,
    style: {
      ...base,
      ...styles[variant]
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Card({
  tone = 'card',
  bordered = false,
  radius = 'card',
  padding = 'var(--space-4)',
  children,
  style,
  ...rest
}) {
  const tones = {
    card: {
      background: 'var(--surface-card)',
      color: 'var(--text-body)'
    },
    page: {
      background: 'var(--surface-page)',
      color: 'var(--text-body)'
    },
    inverse: {
      background: 'var(--surface-inverse)',
      color: 'var(--text-on-dark)'
    }
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      ...tones[tone],
      padding,
      borderRadius: radius === 'media' ? 'var(--radius-media)' : radius === 'screen' ? 'var(--radius-screen)' : 'var(--radius-card)',
      border: bordered ? `var(--border-width) solid ${tone === 'inverse' ? 'var(--trail-line-on-dark)' : 'var(--border-subtle)'}` : 'none',
      boxShadow: 'var(--shadow-none)',
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Chip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Chip({
  selected = false,
  children,
  ...rest
}) {
  const look = selected ? {
    background: 'var(--action-primary)',
    color: 'var(--action-primary-text)',
    border: 'none',
    padding: '10px 16px',
    fontWeight: 'var(--weight-bold)'
  } : {
    background: 'transparent',
    color: 'var(--text-body)',
    border: 'var(--border-width) solid var(--border-strong)',
    padding: '9px 16px',
    fontWeight: 'var(--weight-regular)'
  };
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-min-size)',
      borderRadius: 'var(--radius-pill)',
      display: 'inline-flex',
      alignItems: 'center',
      cursor: 'pointer',
      ...look
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Chip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Chip.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Input({
  value,
  placeholder,
  focused = false,
  leading,
  trailing,
  hint,
  ...rest
}) {
  const trail = trailing ?? (hint ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-code-size)',
      color: 'var(--text-muted)'
    }
  }, hint) : null);
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: 'var(--surface-card)',
      border: `var(--border-width) solid ${focused ? 'var(--focus-ring)' : 'var(--border-strong)'}`,
      borderRadius: 'var(--radius-card)',
      padding: '14px 16px',
      minHeight: 'var(--tap-min)',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-3)',
      outline: focused ? `var(--focus-width) solid var(--focus-ring-wash)` : 'none',
      fontFamily: 'var(--font-sans)'
    }
  }, rest), leading && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      color: 'var(--text-muted)',
      flexShrink: 0
    }
  }, leading), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 'var(--text-body-size)',
      color: value ? 'var(--text-strong)' : 'var(--text-muted)'
    }
  }, value || placeholder), trail && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      color: 'var(--text-muted)',
      flexShrink: 0
    }
  }, trail));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/core/KeepToggle.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function KeepToggle({
  kept = false,
  size = 48,
  label = 'Keep',
  onToggle,
  ...rest
}) {
  const dot = Math.round(size * 0.46);
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    "aria-pressed": kept,
    "aria-label": kept ? label + ' — kept' : label,
    onClick: onToggle,
    style: {
      width: size,
      height: size,
      minWidth: size,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
      border: 'none',
      padding: 0,
      cursor: 'pointer',
      borderRadius: '50%',
      transition: 'opacity var(--motion-fade-duration) var(--motion-fade-ease)'
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: dot,
      height: dot,
      borderRadius: '50%',
      display: 'block',
      background: kept ? 'var(--stop-destination)' : 'transparent',
      border: kept ? 'none' : 'var(--border-width-strong) solid var(--border-strong)'
    }
  }));
}
Object.assign(__ds_scope, { KeepToggle });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/KeepToggle.jsx", error: String((e && e.message) || e) }); }

// components/core/Label.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Label({
  tone = 'muted',
  as: As = 'span',
  children,
  style,
  ...rest
}) {
  const colors = {
    muted: 'var(--text-muted)',
    strong: 'var(--text-strong)',
    onDark: 'var(--text-on-dark-muted)',
    saved: 'var(--stop-destination)'
  };
  return /*#__PURE__*/React.createElement(As, _extends({
    style: {
      fontFamily: 'var(--font-sans)',
      fontWeight: 'var(--weight-bold)',
      fontSize: 'var(--text-label-size)',
      letterSpacing: 'var(--text-label-tracking)',
      textTransform: 'uppercase',
      color: colors[tone],
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Label });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Label.jsx", error: String((e && e.message) || e) }); }

// components/travel/PlaceCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function PlaceCard({
  name,
  meta,
  note,
  kept = false,
  onToggle,
  ...rest
}) {
  return /*#__PURE__*/React.createElement(__ds_scope.Card, _extends({
    bordered: true,
    padding: "var(--space-3)"
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      gap: 'var(--space-2)',
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 'var(--weight-bold)',
      fontSize: 'var(--text-body-size)',
      color: 'var(--text-strong)',
      lineHeight: 1.35
    }
  }, name), meta && /*#__PURE__*/React.createElement(__ds_scope.Label, null, meta), note && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-small-size)',
      lineHeight: 1.6,
      color: 'var(--text-body)'
    }
  }, note)), /*#__PURE__*/React.createElement(__ds_scope.KeepToggle, {
    kept: kept,
    onToggle: onToggle,
    label: 'Keep ' + (name || 'this')
  })));
}
Object.assign(__ds_scope, { PlaceCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/travel/PlaceCard.jsx", error: String((e && e.message) || e) }); }

// components/travel/TimeRow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function TimeRow({
  time,
  title,
  meta,
  state = 'waiting',
  onDark = false,
  trailing,
  ...rest
}) {
  const dotColor = {
    decided: 'var(--stop-decided)',
    open: 'var(--stop-open)',
    destination: 'var(--stop-destination)',
    waiting: 'var(--stop-waiting)'
  }[state];
  const open = state === 'open';
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'grid',
      gridTemplateColumns: 'auto 20px 1fr auto',
      alignItems: 'start',
      gap: 'var(--space-3)',
      padding: 'var(--space-3) 0',
      minHeight: 'var(--tap-min)',
      fontFamily: 'var(--font-sans)'
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-data-size)',
      letterSpacing: 'var(--text-data-tracking)',
      color: onDark ? 'var(--text-on-dark)' : 'var(--text-strong)',
      minWidth: 108,
      paddingTop: 1
    }
  }, time), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      justifyContent: 'center',
      paddingTop: 7
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: open ? 14 : 10,
      height: open ? 14 : 10,
      borderRadius: '50%',
      background: open ? 'transparent' : dotColor,
      border: open ? `3px solid ${dotColor}` : 'none',
      display: 'block'
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'grid',
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 'var(--weight-bold)',
      fontSize: 'var(--text-body-size)',
      color: onDark ? 'var(--text-on-dark)' : 'var(--text-strong)',
      lineHeight: 1.4
    }
  }, title), meta && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-small-size)',
      lineHeight: 1.5,
      color: onDark ? 'var(--text-on-dark-muted)' : 'var(--text-muted)'
    }
  }, meta)), trailing && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center'
    }
  }, trailing));
}
Object.assign(__ds_scope, { TimeRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/travel/TimeRow.jsx", error: String((e && e.message) || e) }); }

// ui_kits/roadbook/DaysScreen.jsx
try { (() => {
function DaysScreen() {
  const {
    Card,
    Label
  } = window.WendDesignSystem_c7e2ae;
  const {
    days
  } = window.WEND_ROAD;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 'var(--space-3)',
      padding: 'var(--space-6) 0 var(--space-4)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 'var(--weight-bold)',
      fontSize: 'var(--text-title-size)',
      color: 'var(--text-strong)'
    }
  }, "Six days in Kyoto"), days.map(d => /*#__PURE__*/React.createElement(Card, {
    key: d.day,
    bordered: true,
    padding: "var(--space-4)",
    style: {
      display: 'grid',
      gridTemplateColumns: 'auto 1fr',
      gap: 'var(--space-3)',
      alignItems: 'start',
      outline: d.today ? 'var(--focus-width) solid var(--focus-ring)' : 'none',
      outlineOffset: 'var(--focus-offset)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 12,
      height: 12,
      borderRadius: '50%',
      marginTop: 5,
      background: d.today ? 'transparent' : 'var(--stop-decided)',
      border: d.today ? '3px solid var(--stop-open)' : 'none'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'grid',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(Label, {
    tone: "strong"
  }, d.day), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 'var(--weight-bold)',
      fontSize: 'var(--text-body-size)',
      color: 'var(--text-strong)'
    }
  }, d.head), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-small-size)',
      color: 'var(--text-muted)'
    }
  }, d.meta)))));
}
Object.assign(window, {
  DaysScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/roadbook/DaysScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/roadbook/KeptScreen.jsx
try { (() => {
function KeptScreen() {
  const {
    PlaceCard,
    Chip,
    Input
  } = window.WendDesignSystem_c7e2ae;
  const {
    kept
  } = window.WEND_ROAD;
  const [on, setOn] = React.useState({});
  const [filter, setFilter] = React.useState('Near me');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 'var(--space-3)',
      padding: 'var(--space-6) 0 var(--space-4)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 'var(--weight-bold)',
      fontSize: 'var(--text-title-size)',
      color: 'var(--text-strong)'
    }
  }, "Kept nine places so far"), /*#__PURE__*/React.createElement(Input, {
    placeholder: "Anything nearby?",
    hint: "\u21B5"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-2)',
      flexWrap: 'wrap'
    }
  }, ['Near me', 'Today', 'Evening'].map(t => /*#__PURE__*/React.createElement(Chip, {
    key: t,
    selected: filter === t,
    onClick: () => setFilter(t)
  }, t))), kept.map(k => /*#__PURE__*/React.createElement(PlaceCard, {
    key: k.name,
    name: k.name,
    meta: k.meta,
    note: k.note,
    kept: on[k.name] ?? true,
    onToggle: () => setOn(s => ({
      ...s,
      [k.name]: !(s[k.name] ?? true)
    }))
  })));
}
Object.assign(window, {
  KeptScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/roadbook/KeptScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/roadbook/Phone.jsx
try { (() => {
function Phone({
  tab,
  onTab,
  dark,
  children
}) {
  const {
    Logo,
    Label
  } = window.WendDesignSystem_c7e2ae;
  const tabs = ['Today', 'Days', 'Kept'];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 390,
      height: 844,
      borderRadius: 'var(--radius-screen)',
      overflow: 'hidden',
      background: dark ? 'var(--surface-inverse)' : 'var(--surface-page)',
      border: 'var(--border-width) solid var(--border-strong)',
      display: 'grid',
      gridTemplateRows: 'auto 1fr auto',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px var(--gutter-screen) 0',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-code-size)',
      color: dark ? 'var(--text-on-dark-muted)' : 'var(--text-muted)'
    }
  }, "09:52"), /*#__PURE__*/React.createElement(Logo, {
    size: 18,
    variant: dark ? 'reversed' : 'primary'
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-code-size)',
      color: dark ? 'var(--text-on-dark-muted)' : 'var(--text-muted)'
    }
  }, "82%")), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowY: 'auto',
      padding: '0 var(--gutter-screen)'
    }
  }, children), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      borderTop: `var(--border-width) solid ${dark ? 'var(--trail-line-on-dark)' : 'var(--border-subtle)'}`
    }
  }, tabs.map((t, i) => /*#__PURE__*/React.createElement("button", {
    key: t,
    onClick: () => onTab(i),
    style: {
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
      minHeight: 'var(--tap-min)',
      padding: '14px 0 22px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: i === tab ? 'var(--stop-open)' : 'transparent',
      border: i === tab ? 'none' : `2px solid ${dark ? 'var(--trail-line-on-dark)' : 'var(--border-strong)'}`
    }
  }), /*#__PURE__*/React.createElement(Label, {
    tone: i === tab ? dark ? 'onDark' : 'strong' : dark ? 'onDark' : 'muted',
    style: i === tab && dark ? {
      color: 'var(--text-on-dark)'
    } : undefined
  }, t)))));
}
Object.assign(window, {
  Phone
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/roadbook/Phone.jsx", error: String((e && e.message) || e) }); }

// ui_kits/roadbook/TodayScreen.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function TodayScreen() {
  const {
    TimeRow,
    Label,
    Button,
    Trail
  } = window.WendDesignSystem_c7e2ae;
  const {
    today
  } = window.WEND_ROAD;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 'var(--space-4)',
      padding: 'var(--space-6) 0 var(--space-4)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 'var(--space-2)'
    }
  }, /*#__PURE__*/React.createElement(Label, {
    tone: "onDark"
  }, "Thursday 17 \xB7 east, then north"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 'var(--weight-bold)',
      fontSize: 'var(--text-display-size)',
      lineHeight: 'var(--text-display-line)',
      color: 'var(--text-on-dark)'
    }
  }, "Nanzen-ji, now"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-body-size)',
      lineHeight: 1.6,
      color: 'var(--text-on-dark-muted)'
    }
  }, "Until 11:40. The aqueduct is round the back, past the hall.")), /*#__PURE__*/React.createElement(Trail, {
    onDark: true,
    stops: ['decided', 'open', 'waiting', 'waiting', 'destination'],
    height: 40
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: 'var(--border-width) solid var(--trail-line-on-dark)',
      paddingTop: 'var(--space-2)'
    }
  }, today.map(r => /*#__PURE__*/React.createElement(TimeRow, _extends({
    key: r.time,
    onDark: true
  }, r)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 'var(--space-3)',
      paddingTop: 'var(--space-2)'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "onDark"
  }, "Take the long way"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-small-size)',
      lineHeight: 1.6,
      color: 'var(--text-on-dark-muted)'
    }
  }, "You'll get there. Slowly is fine.")));
}
Object.assign(window, {
  TodayScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/roadbook/TodayScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/roadbook/data.js
try { (() => {
window.WEND_ROAD = {
  today: [{
    time: '09:40',
    title: 'Leave the ryokan',
    meta: 'east \u00b7 12 min walk to the bus',
    state: 'decided'
  }, {
    time: '10:15\u201311:40',
    title: 'Nanzen-ji',
    meta: 'temple \u00b7 aqueduct at the back',
    state: 'open'
  }, {
    time: '11:50\u201312:40',
    title: 'Philosopher\u2019s Path',
    meta: '2 km, canal side',
    state: 'waiting'
  }, {
    time: '13:00',
    title: 'Lunch, undecided',
    meta: 'two kept nearby',
    state: 'waiting'
  }, {
    time: '15:30',
    title: 'Train to Kurama',
    meta: 'Demachiyanagi \u00b7 Platform 3',
    state: 'waiting'
  }, {
    time: '18:20',
    title: 'Kurama onsen',
    meta: 'last bus back 21:05',
    state: 'destination'
  }],
  days: [{
    day: 'Mon 14',
    head: 'Arrive, walk the river',
    meta: 'centre \u00b7 3 stops'
  }, {
    day: 'Tue 15',
    head: 'South, gates at dusk',
    meta: 'south \u00b7 4 stops'
  }, {
    day: 'Wed 16',
    head: 'Nothing planned',
    meta: 'kept: 5 places nearby'
  }, {
    day: 'Thu 17',
    head: 'East, then north',
    meta: 'east \u00b7 6 stops',
    today: true
  }, {
    day: 'Fri 18',
    head: 'Market morning',
    meta: 'centre \u00b7 2 stops'
  }, {
    day: 'Sat 19',
    head: 'Last train home',
    meta: '\u00b7'
  }],
  kept: [{
    name: 'Ippodo, tea sitting',
    meta: 'afternoon · centre',
    note: '4 min from where you are.'
  }, {
    name: 'Fushimi Inari at dusk',
    meta: 'evening · south',
    note: 'The gates thin out after five.'
  }, {
    name: 'Pontocho, no plan',
    meta: 'night · centre',
    note: 'Walk the alley and pick a door.'
  }]
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/roadbook/data.js", error: String((e && e.message) || e) }); }

__ds_ns.Logo = __ds_scope.Logo;

__ds_ns.Placeholder = __ds_scope.Placeholder;

__ds_ns.Trail = __ds_scope.Trail;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Chip = __ds_scope.Chip;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.KeepToggle = __ds_scope.KeepToggle;

__ds_ns.Label = __ds_scope.Label;

__ds_ns.PlaceCard = __ds_scope.PlaceCard;

__ds_ns.TimeRow = __ds_scope.TimeRow;

})();
