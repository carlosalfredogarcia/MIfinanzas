/* ────────────────────────────────────────────────
   MiFinanza – Custom Date Picker
   Replaces <input type="date"> across all pages.
   Usage:
     HTML:  <span class="dp-wrap">
              <input type="hidden" id="MY_ID" class="dp-real-input">
              <button type="button" class="inp dp-btn" data-dp-for="MY_ID" onclick="openDatePicker('MY_ID')">
                <span class="dp-txt">Seleccionar fecha</span>
                <svg class="dp-cal-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="3" width="16" height="15" rx="2"/><path d="M2 8h16M7 1v4M13 1v4"/></svg>
              </button>
            </span>
     JS init happens automatically at DOMContentLoaded via [data-dp-for] scan.
─────────────────────────────────────────────────*/
;(function () {
  'use strict'

  /* ── Constants ── */
  const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const DAYS_ES   = ['L','M','X','J','V','S','D']
  const CAL_SVG   = `<svg class="dp-cal-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="15" rx="2"/><path d="M2 8h16M7 1v4M13 1v4"/></svg>`

  /* ── State ── */
  let dpActiveEl  = null   // the hidden <input> being edited
  let dpYear      = 0
  let dpMonth     = 0      // 0-11
  const dpToday   = new Date()

  /* ── Format helpers ── */
  function fmtYMD (d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }
  function fmtDisplay (yyyymmdd) {
    if (!yyyymmdd) return ''
    const parts = yyyymmdd.split('-')
    if (parts.length < 3) return yyyymmdd
    const y = parseInt(parts[0],10)
    const m = parseInt(parts[1],10)
    const d = parseInt(parts[2],10)
    const mos = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
    return `${d} ${mos[m-1]} ${y}`
  }

  /* Expose for use in JS template strings */
  window._dpFmt = fmtDisplay

  /* ── CSS injection ── */
  function injectStyles () {
    if (document.getElementById('dp-styles')) return
    const s = document.createElement('style')
    s.id = 'dp-styles'
    s.textContent = `
/* ── Datepicker field ── */
.dp-wrap {
  display: block;
  position: relative;
  width: 100%;
}
.dp-btn {
  display: flex !important;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: border-color .18s, background .18s;
  background: #1a1d27 !important;
  border: 1px solid #2a2e3a !important;
  border-radius: 10px !important;
  padding: 10px 13px !important;
  color: #e6edf3 !important;
  font-size: 15px !important;
  font-family: inherit;
  line-height: 1.4;
  min-height: 44px;
}
.dp-btn:hover, .dp-btn:focus {
  border-color: #4ade80 !important;
  outline: none;
}
.dp-txt {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #e6edf3;
}
.dp-txt[data-empty="true"] {
  color: #8b949e;
}
.dp-cal-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: #8b949e;
}
/* Error state – works even though the hidden input is invisible */
.dp-real-input.inp-error ~ .dp-btn {
  border-color: #f85149 !important;
}

/* ── Modal overlay ── */
#dp-modal {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 9999;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: env(safe-area-inset-bottom, 0);
}
#dp-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,.55);
}

/* ── Calendar panel ── */
#dp-panel {
  position: relative;
  z-index: 1;
  background: #1a1d27;
  border: 1px solid #2a2e3a;
  border-radius: 20px 20px 0 0;
  width: 100%;
  max-width: 400px;
  padding: 20px 16px 32px;
  box-shadow: 0 -6px 32px rgba(0,0,0,.5);
  animation: dpSlideUp .22s cubic-bezier(.22,.68,0,1.2) both;
}
@keyframes dpSlideUp {
  from { transform: translateY(100%); opacity: 0 }
  to   { transform: translateY(0);    opacity: 1 }
}

/* Header – month nav */
#dp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}
.dp-nav-btn {
  background: none;
  border: 1px solid #2a2e3a;
  border-radius: 8px;
  color: #e6edf3;
  font-size: 22px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background .15s, border-color .15s;
  line-height: 1;
  padding: 0;
}
.dp-nav-btn:hover { background: #2a2e3a; border-color: #4ade80; }
#dp-month-label {
  font-size: 16px;
  font-weight: 600;
  color: #e6edf3;
  letter-spacing: .02em;
}

/* Weekday headers */
#dp-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 8px;
}
#dp-weekdays span {
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: #8b949e;
  padding: 4px 0;
  letter-spacing: .05em;
}

/* Day grid */
#dp-days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 3px;
}
.dp-day {
  background: none;
  border: none;
  border-radius: 50%;
  color: #e6edf3;
  font-size: 14px;
  font-family: inherit;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin: 0 auto;
  transition: background .12s, color .12s;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
}
.dp-day:hover { background: #2a2e3a; }
.dp-day.dp-today {
  border: 1.5px solid #4ade80;
  color: #4ade80;
  font-weight: 600;
}
.dp-day.dp-selected {
  background: #4ade80 !important;
  color: #0d1117 !important;
  font-weight: 700;
}
.dp-day.dp-selected.dp-today {
  border-color: transparent;
}
.dp-day.dp-empty {
  pointer-events: none;
  visibility: hidden;
}
    `
    document.head.appendChild(s)
  }

  /* ── Build modal (once) ── */
  function ensureModal () {
    if (document.getElementById('dp-modal')) return
    injectStyles()
    const el = document.createElement('div')
    el.id = 'dp-modal'
    el.innerHTML = `
      <div id="dp-overlay"></div>
      <div id="dp-panel">
        <div id="dp-header">
          <button type="button" class="dp-nav-btn" id="dp-prev">&#8249;</button>
          <span id="dp-month-label"></span>
          <button type="button" class="dp-nav-btn" id="dp-next">&#8250;</button>
        </div>
        <div id="dp-weekdays">${DAYS_ES.map(d => `<span>${d}</span>`).join('')}</div>
        <div id="dp-days"></div>
      </div>
    `
    document.body.appendChild(el)
    document.getElementById('dp-overlay').addEventListener('click', closeDatePicker)
    document.getElementById('dp-prev').addEventListener('click', dpPrevMonth)
    document.getElementById('dp-next').addEventListener('click', dpNextMonth)
    // Permanent delegated listener — never removed, so month nav + re-renders keep working
    document.getElementById('dp-days').addEventListener('click', function (e) {
      const btn = e.target.closest('.dp-day')
      if (btn && !btn.classList.contains('dp-empty')) dpSelectDay(btn.dataset.ds)
    })
  }

  /* ── Render calendar grid ── */
  function renderCalendar () {
    document.getElementById('dp-month-label').textContent = `${MONTHS_ES[dpMonth]} ${dpYear}`

    // First weekday of month: 0=Sun → convert to Mon-based (0=Mon)
    const firstDow   = new Date(dpYear, dpMonth, 1).getDay()
    const startOff   = (firstDow === 0 ? 6 : firstDow - 1)
    const daysInMon  = new Date(dpYear, dpMonth + 1, 0).getDate()
    const todayStr   = fmtYMD(dpToday)
    const currentVal = dpActiveEl ? dpActiveEl.value : ''

    let html = ''
    for (let i = 0; i < startOff; i++) {
      html += '<button type="button" class="dp-day dp-empty" tabindex="-1"></button>'
    }
    for (let d = 1; d <= daysInMon; d++) {
      const ds  = `${dpYear}-${String(dpMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      let cls   = 'dp-day'
      if (ds === currentVal) cls += ' dp-selected'
      if (ds === todayStr)   cls += ' dp-today'
      html += `<button type="button" class="${cls}" data-ds="${ds}">${d}</button>`
    }
    document.getElementById('dp-days').innerHTML = html
  }

  /* ── Open / close ── */
  window.openDatePicker = function (id) {
    const inp = document.getElementById(id)
    if (!inp) return
    dpActiveEl = inp
    _openCalendar()
  }

  window.openDatePickerEl = function (el) {
    if (!el) return
    dpActiveEl = el
    _openCalendar()
  }

  function _openCalendar () {
    ensureModal()
    const val = dpActiveEl ? dpActiveEl.value : ''
    if (val && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
      const parts = val.split('-').map(Number)
      dpYear  = parts[0]
      dpMonth = parts[1] - 1
    } else {
      dpYear  = dpToday.getFullYear()
      dpMonth = dpToday.getMonth()
    }
    renderCalendar()
    document.getElementById('dp-modal').style.display = 'flex'
  }

  window.closeDatePicker = function () {
    const m = document.getElementById('dp-modal')
    if (m) m.style.display = 'none'
    dpActiveEl = null
  }

  window.dpPrevMonth = function () {
    dpMonth--
    if (dpMonth < 0) { dpMonth = 11; dpYear-- }
    renderCalendar()
  }

  window.dpNextMonth = function () {
    dpMonth++
    if (dpMonth > 11) { dpMonth = 0; dpYear++ }
    renderCalendar()
  }

  function dpSelectDay (dateStr) {
    if (!dpActiveEl) return
    // Update display button directly (covers rv-fecha where there's no id)
    const btn = dpActiveEl.nextElementSibling
    if (btn && btn.classList.contains('dp-btn')) {
      const txt = btn.querySelector('.dp-txt')
      if (txt) {
        txt.textContent = fmtDisplay(dateStr)
        txt.removeAttribute('data-empty')
      }
    }
    // Set value — works for both initialized (setter updates _val + display again) and
    // uninitialized hidden inputs (just sets the DOM property directly)
    dpActiveEl.value = dateStr
    // Fire events for validation listeners
    dpActiveEl.dispatchEvent(new Event('input',  { bubbles: true }))
    dpActiveEl.dispatchEvent(new Event('change', { bubbles: true }))
    closeDatePicker()
  }

  /* ── initDatePickerField(id)
     Overrides .value getter/setter on the hidden input so that
     existing code like  el.value = hoy  also updates the display.
  ── */
  window.initDatePickerField = function (id) {
    const inp = document.getElementById(id)
    if (!inp || inp._dpInit) return
    inp._dpInit = true

    // Grab current value before we shadow it
    const proto      = Object.getPrototypeOf(inp)
    const origGetter = Object.getOwnPropertyDescriptor(proto, 'value')?.get
    const origSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    let _val         = origGetter ? origGetter.call(inp) : inp.getAttribute('value') || ''

    // Update button display with initial value
    _setDisplay(id, _val)

    Object.defineProperty(inp, 'value', {
      configurable: true,
      enumerable:   true,
      get () { return _val },
      set (v) {
        _val = v || ''
        _setDisplay(id, _val)
        // Also call original setter so the DOM attribute stays in sync (optional)
        try { origSetter && origSetter.call(inp, _val) } catch (_) {}
      }
    })
  }

  function _setDisplay (id, val) {
    const btn = document.querySelector(`[data-dp-for="${id}"]`)
    if (!btn) return
    const txt = btn.querySelector('.dp-txt')
    if (!txt) return
    if (val) {
      txt.textContent = fmtDisplay(val)
      txt.removeAttribute('data-empty')
    } else {
      txt.textContent = 'Seleccionar fecha'
      txt.dataset.empty = 'true'
    }
  }

  /* ── Auto-init: scan for [data-dp-for] after DOM ready ── */
  function autoInit () {
    injectStyles()
    document.querySelectorAll('[data-dp-for]').forEach(btn => {
      initDatePickerField(btn.dataset.dpFor)
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit)
  } else {
    autoInit()
  }
})()
