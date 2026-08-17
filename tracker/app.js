(function () {
  'use strict';

  var STORAGE_KEY = 'suiviSportif.v1';
  var DAY_LABELS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];
  var FULL_DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

  // ═══════════════════════ STATE ═══════════════════════

  function uid() {
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function emptyWeekChecks() {
    return [false, false, false, false, false, false, false];
  }

  function newExercise() {
    return { id: uid(), type: 'exercise', name: '', series: '', reps: '', rest: '' };
  }

  function newRecup() {
    return { id: uid(), type: 'recup', text: '' };
  }

  function defaultState() {
    var habitNames = ['Entraînement', '7h de sommeil', '7 000 pas', "2,5L d'eau", 'Lever tôt'];
    var habits = habitNames.map(function (n) { return { id: uid(), name: n }; });
    var week1 = { id: uid(), label: 'Semaine 1', checks: {} };
    habits.forEach(function (h) { week1.checks[h.id] = emptyWeekChecks(); });

    var seances = [
      {
        id: uid(), name: 'Push up + Run',
        items: [
          { id: uid(), type: 'exercise', name: 'Pompes', series: '4', reps: '15', rest: '60 sec' },
          { id: uid(), type: 'recup', text: '90 sec de récupération' },
          { id: uid(), type: 'exercise', name: 'Gainage', series: '3', reps: 'Max hold', rest: '45 sec' },
          { id: uid(), type: 'exercise', name: 'Course à pied', series: '1', reps: '20min', rest: '-' }
        ],
        note: ''
      },
      {
        id: uid(), name: 'Legs + Abdos',
        items: [
          { id: uid(), type: 'exercise', name: 'Squats', series: '4', reps: '20', rest: '60 sec' },
          { id: uid(), type: 'exercise', name: 'Fentes', series: '3', reps: '12 par jambe', rest: '60 sec' },
          { id: uid(), type: 'recup', text: '2 min de récupération' },
          { id: uid(), type: 'exercise', name: 'Crunchs', series: '3', reps: '25', rest: '45 sec' }
        ],
        note: ''
      },
      {
        id: uid(), name: 'Steps',
        items: [
          { id: uid(), type: 'exercise', name: 'Marche rapide', series: '1', reps: '30min', rest: '-' }
        ],
        note: '30 min de marche : 5min tranquille puis 20min soutenu, puis 5min retour au calme.'
      }
    ];

    return {
      activeTab: 'habitudes',
      habits: habits,
      weeks: [week1],
      activeWeek: 0,
      seances: seances,
      activeSeance: 0,
      integration: defaultIntegration()
    };
  }

  function defaultIntegration() {
    return { backendUrl: '', passcode: '', stepsHabitId: null, stepsGoal: 7000, autoTick: true };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.habits) && Array.isArray(parsed.weeks) && Array.isArray(parsed.seances)) {
          if (!parsed.integration) parsed.integration = defaultIntegration();
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Impossible de charger les données sauvegardées', e);
    }
    return defaultState();
  }

  var state = load();

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ═══════════════════════ HELPERS ═══════════════════════

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function localDateStr(d) {
    d = d || new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function todayWeekdayIndex() {
    // JS getDay(): Dimanche=0..Samedi=6 -> on veut Lundi=0..Dimanche=6
    return (new Date().getDay() + 6) % 7;
  }

  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2200);
  }

  // ═══════════════════════ MODAL ═══════════════════════

  function openModal(html, onMount) {
    var root = document.getElementById('modal-root');
    root.innerHTML = '<div class="modal-overlay" data-action="modal-close"><div class="modal-box" role="dialog" aria-modal="true">' + html + '</div></div>';
    root.querySelector('.modal-box').addEventListener('click', function (e) { e.stopPropagation(); });
    root.querySelector('.modal-overlay').addEventListener('click', closeModal);
    if (onMount) onMount(root);
  }

  function closeModal() {
    document.getElementById('modal-root').innerHTML = '';
  }

  function openConfirm(message, confirmLabel, onConfirm) {
    var html = '<h3>Confirmer</h3><p style="margin-bottom:1rem">' + escapeHtml(message) + '</p>' +
      '<div class="modal-actions">' +
      '<button class="btn btn-ghost" data-action="cancel">Annuler</button>' +
      '<button class="btn btn-danger" data-action="yes">' + escapeHtml(confirmLabel) + '</button>' +
      '</div>';
    openModal(html, function (root) {
      root.querySelector('[data-action="yes"]').addEventListener('click', function () { closeModal(); onConfirm(); });
      root.querySelector('[data-action="cancel"]').addEventListener('click', closeModal);
    });
  }

  // ═══════════════════════ RENDER DISPATCH ═══════════════════════

  function render() {
    persist();
    document.querySelectorAll('.tab-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === state.activeTab);
    });
    document.getElementById('panel-habitudes').hidden = state.activeTab !== 'habitudes';
    document.getElementById('panel-seances').hidden = state.activeTab !== 'seances';
    if (state.activeTab === 'habitudes') renderHabitudes(); else renderSeances();
  }

  // ═══════════════════════ MONTRES CONNECTÉES (PAS) ═══════════════════════
  // Le suivi des pas dépend d'un backend externe (Cloudflare Worker) que
  // l'utilisateur déploie et configure lui-même (URL + mot de passe). Sans
  // configuration, cette partie reste silencieuse et l'app fonctionne comme
  // avant, 100% locale.

  var stepsRuntime = { loading: false, error: null, data: null };

  function backendConfigured() {
    return !!(state.integration.backendUrl && state.integration.passcode);
  }

  function backendFetch(path, opts) {
    opts = opts || {};
    var base = state.integration.backendUrl.replace(/\/+$/, '');
    var headers = Object.assign({ 'X-App-Passcode': state.integration.passcode }, opts.headers || {});
    return fetch(base + path, Object.assign({}, opts, { headers: headers }));
  }

  function refreshStepsWidgetIfVisible() {
    if (state.activeTab === 'habitudes') renderHabitudes();
  }

  function applyAutoTick(steps) {
    if (steps == null) return;
    var integ = state.integration;
    if (!integ.autoTick || !integ.stepsHabitId) return;
    if (steps < (integ.stepsGoal || 7000)) return;
    if (!state.habits.some(function (h) { return h.id === integ.stepsHabitId; })) return;
    var week = state.weeks[state.weeks.length - 1];
    if (!week) return;
    if (!week.checks[integ.stepsHabitId]) week.checks[integ.stepsHabitId] = emptyWeekChecks();
    var idx = todayWeekdayIndex();
    if (!week.checks[integ.stepsHabitId][idx]) {
      week.checks[integ.stepsHabitId][idx] = true;
      persist();
    }
  }

  function syncSteps(silent) {
    if (!backendConfigured()) return Promise.resolve();
    stepsRuntime.loading = true;
    if (!silent) refreshStepsWidgetIfVisible();
    return backendFetch('/api/steps?date=' + localDateStr())
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        stepsRuntime.data = data;
        stepsRuntime.error = null;
        applyAutoTick(data.best);
      })
      .catch(function (e) {
        stepsRuntime.error = e.message || 'Erreur de synchronisation';
      })
      .finally(function () {
        stepsRuntime.loading = false;
        refreshStepsWidgetIfVisible();
      });
  }

  function stepsWidgetHtml() {
    if (!backendConfigured()) {
      return '<div class="steps-connect-hint"><span>⌚ Connecte une montre pour suivre tes pas automatiquement</span>' +
        '<button class="btn btn-sun btn-sm" data-action="open-connexions">Connecter</button></div>';
    }
    var d = stepsRuntime.data;
    var steps = d ? d.best : null;
    var goal = state.integration.stepsGoal || 7000;
    var pct = steps != null ? Math.min(100, Math.round(steps / goal * 100)) : 0;
    var srcLabel = '';
    if (d && d.sources) {
      var names = Object.keys(d.sources).filter(function (k) { return typeof d.sources[k] === 'number'; });
      if (names.length) srcLabel = 'Source' + (names.length > 1 ? 's' : '') + ' : ' + names.join(', ');
    }
    var numDisplay = stepsRuntime.loading ? '…' : (steps != null ? steps.toLocaleString('fr-FR') : '—');
    var errorLine = stepsRuntime.error ? '<div class="steps-src" style="color:var(--coral-dk)">' + escapeHtml(stepsRuntime.error) + '</div>' : '';
    return '<div class="steps-card">' +
      '<div class="steps-icon">👟</div>' +
      '<div class="steps-main">' +
      '<div class="steps-num">' + numDisplay + ' <small>/ ' + goal.toLocaleString('fr-FR') + ' pas</small></div>' +
      '<div class="steps-goal-bar"><div class="steps-goal-fill" style="width:' + pct + '%"></div></div>' +
      (srcLabel ? '<div class="steps-src">' + escapeHtml(srcLabel) + '</div>' : '') +
      errorLine +
      '</div>' +
      '<button class="btn btn-icon btn-ghost steps-sync-btn" data-action="steps-sync" aria-label="Synchroniser">' + (stepsRuntime.loading ? '⏳' : '↻') + '</button>' +
      '</div>';
  }

  function providerRowHtml(pid, label, connected) {
    return '<div class="provider-row">' +
      '<span class="provider-dot ' + (connected ? 'on' : '') + '"></span>' +
      '<span class="provider-name">' + escapeHtml(label) + '</span>' +
      (connected
        ? '<button class="btn btn-sm btn-danger" data-action="provider-disconnect" data-provider="' + pid + '">Déconnecter</button>'
        : '<button class="btn btn-sm btn-primary" data-action="provider-connect" data-provider="' + pid + '">Connecter</button>') +
      '</div>';
  }

  function openConnexionsModal() {
    var integ = state.integration;
    var habitOptions = '<option value="">— aucune —</option>' + state.habits.map(function (h) {
      return '<option value="' + h.id + '" ' + (integ.stepsHabitId === h.id ? 'selected' : '') + '>' + escapeHtml(h.name) + '</option>';
    }).join('');
    var configured = backendConfigured();

    var html = '<h3>⌚ Montres connectées</h3>' +
      '<div class="settings-field"><label for="backend-url-input">URL du backend</label>' +
      '<input type="text" id="backend-url-input" placeholder="https://....workers.dev" value="' + escapeHtml(integ.backendUrl) + '"/></div>' +
      '<div class="settings-field"><label for="backend-passcode-input">Mot de passe</label>' +
      '<input type="password" id="backend-passcode-input" value="' + escapeHtml(integ.passcode) + '"/></div>' +
      '<button class="btn btn-primary btn-block" data-action="save-backend-settings">Enregistrer</button>' +
      '<div id="providers-list" style="margin-top:1rem">' +
      (configured ? '<p class="muted" style="text-align:center;padding:.5rem 0">Chargement…</p>' : '<p class="hint">Renseigne d\'abord l\'URL et le mot de passe de ton backend pour voir les connexions disponibles.</p>') +
      '</div>' +
      (configured ? (
        '<div class="settings-field" style="margin-top:1rem"><label for="steps-habit-select">Habitude à cocher automatiquement</label>' +
        '<select id="steps-habit-select">' + habitOptions + '</select></div>' +
        '<div class="settings-field"><label for="steps-goal-input">Objectif de pas</label>' +
        '<input type="number" id="steps-goal-input" min="0" step="500" value="' + (integ.stepsGoal || 7000) + '"/></div>' +
        '<div class="modal-list-item"><input type="checkbox" id="steps-autotick-input" ' + (integ.autoTick ? 'checked' : '') + '/><label for="steps-autotick-input" style="flex:1">Cocher automatiquement quand l\'objectif est atteint</label></div>' +
        '<button class="btn btn-primary btn-block" style="margin-top:.8rem" data-action="save-steps-settings">Enregistrer ces réglages</button>'
      ) : '') +
      '<div class="modal-actions" style="margin-top:1rem"><button class="btn btn-ghost" data-action="modal-close">Fermer</button></div>';

    openModal(html, function (root) {
      root.querySelector('[data-action="modal-close"]').addEventListener('click', closeModal);
      root.querySelector('[data-action="save-backend-settings"]').addEventListener('click', function () {
        integ.backendUrl = root.querySelector('#backend-url-input').value.trim();
        integ.passcode = root.querySelector('#backend-passcode-input').value.trim();
        persist();
        closeModal();
        openConnexionsModal();
        syncSteps();
      });
      if (configured) {
        var saveStepsBtn = root.querySelector('[data-action="save-steps-settings"]');
        saveStepsBtn.addEventListener('click', function () {
          integ.stepsHabitId = root.querySelector('#steps-habit-select').value || null;
          integ.stepsGoal = Math.max(0, parseInt(root.querySelector('#steps-goal-input').value, 10) || 7000);
          integ.autoTick = root.querySelector('#steps-autotick-input').checked;
          persist();
          closeModal();
          toast('Réglages enregistrés');
          syncSteps();
        });
        loadProvidersList(root);
      }
    });
  }

  function loadProvidersList(root) {
    var container = root.querySelector('#providers-list');
    backendFetch('/api/connections')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var html = '';
        ['withings', 'polar', 'googlehealth'].forEach(function (pid) {
          var p = data[pid] || { label: pid, connected: false };
          html += providerRowHtml(pid, p.label, p.connected);
        });
        var appleConnected = data.apple && data.apple.connected;
        var webhookUrl = state.integration.backendUrl.replace(/\/+$/, '') + '/webhook/apple?passcode=' + state.integration.passcode;
        html += '<div class="provider-row"><span class="provider-dot ' + (appleConnected ? 'on' : '') + '"></span>' +
          '<span class="provider-name">Apple Watch' +
          '<div class="provider-sub">' + (appleConnected ? 'Dernière synchro : ' + (data.apple.lastSync ? new Date(data.apple.lastSync).toLocaleString('fr-FR') : '?') : "Via l'app Health Auto Export + Raccourcis") + '</div></span>' +
          (appleConnected ? '<button class="btn btn-sm btn-danger" data-action="provider-disconnect" data-provider="apple">Oublier</button>' : '') +
          '</div>' +
          '<div class="webhook-url-box"><code id="webhook-url-code">' + escapeHtml(webhookUrl) + '</code>' +
          '<button class="btn btn-sm" data-action="copy-webhook">Copier</button></div>' +
          '<p class="hint">Colle cette URL dans Health Auto Export (ou Health Webhook), avec les pas exportés en cumul du jour (pas en delta), et une automatisation Raccourcis qui l\'envoie régulièrement.</p>';
        container.innerHTML = html;

        container.querySelectorAll('[data-action="provider-connect"]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var pid = btn.dataset.provider;
            var url = state.integration.backendUrl.replace(/\/+$/, '') + '/auth/' + pid + '/start?passcode=' + encodeURIComponent(state.integration.passcode);
            window.open(url, '_blank');
          });
        });
        container.querySelectorAll('[data-action="provider-disconnect"]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var pid = btn.dataset.provider;
            backendFetch('/api/disconnect/' + pid, { method: 'POST' })
              .then(function () { toast('Déconnecté'); loadProvidersList(root); })
              .catch(function (e) { toast('Erreur : ' + e.message); });
          });
        });
        var copyBtn = container.querySelector('[data-action="copy-webhook"]');
        if (copyBtn) {
          copyBtn.addEventListener('click', function () {
            var text = container.querySelector('#webhook-url-code').textContent;
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(text).then(function () { toast('URL copiée'); }).catch(function () { toast('Impossible de copier'); });
            }
          });
        }
      })
      .catch(function (e) {
        container.innerHTML = '<p class="hint" style="color:var(--coral-dk)">Impossible de charger le statut des connexions (' + escapeHtml(e.message) + ').</p>';
      });
  }

  // ═══════════════════════ HABITUDES ═══════════════════════

  function pctClass(pct) {
    if (pct >= 70) return 'high';
    if (pct >= 40) return 'mid';
    return '';
  }

  function currentWeek() {
    return state.weeks[state.activeWeek];
  }

  function renderHabitudes() {
    var panel = document.getElementById('panel-habitudes');
    var week = currentWeek();
    var html = '';

    html += stepsWidgetHtml();

    html += '<div class="week-nav">' +
      '<button class="btn btn-icon btn-ghost" data-action="week-prev" ' + (state.activeWeek === 0 ? 'disabled' : '') + ' aria-label="Semaine précédente">‹</button>' +
      '<select data-action="week-select" aria-label="Choisir une semaine">' +
      state.weeks.map(function (w, i) {
        return '<option value="' + i + '" ' + (i === state.activeWeek ? 'selected' : '') + '>' + escapeHtml(w.label) + '</option>';
      }).join('') +
      '</select>' +
      '<button class="btn btn-icon btn-ghost" data-action="week-next" ' + (state.activeWeek === state.weeks.length - 1 ? 'disabled' : '') + ' aria-label="Semaine suivante">›</button>' +
      '<button class="btn btn-icon btn-ghost" data-action="week-edit" aria-label="Modifier la semaine">✎</button>' +
      '<button class="btn btn-icon btn-sun" data-action="week-add" aria-label="Nouvelle semaine">+</button>' +
      '</div>';

    if (state.habits.length === 0) {
      html += '<div class="empty-state"><p>Aucune habitude pour l\'instant.</p>' +
        '<button class="btn btn-primary" data-action="habit-add">+ Ajouter une habitude</button></div>';
    } else {
      html += '<div class="grid-scroll"><table class="habit-grid"><thead><tr>' +
        '<th class="habit-name-head">Habitude</th>' +
        DAY_LABELS.map(function (d) { return '<th>' + d + '</th>'; }).join('') +
        '<th class="pct-cell">%</th></tr></thead><tbody>';

      state.habits.forEach(function (h) {
        var checks = week.checks[h.id] || emptyWeekChecks();
        var checkedCount = checks.filter(Boolean).length;
        var pct = Math.round(checkedCount / 7 * 100);
        html += '<tr data-habit="' + h.id + '">' +
          '<td class="habit-name-cell" data-action="habit-edit" data-habit="' + h.id + '"><span class="habit-name-text">' + escapeHtml(h.name) + '</span></td>' +
          checks.map(function (c, i) {
            return '<td class="day-cell"><button class="check-box ' + (c ? 'checked' : '') + '" data-action="toggle-check" data-habit="' + h.id + '" data-day="' + i + '" aria-label="' + FULL_DAY_NAMES[i] + ' — ' + escapeHtml(h.name) + '" aria-pressed="' + (c ? 'true' : 'false') + '"></button></td>';
          }).join('') +
          '<td class="pct-cell"><div class="pct-wrap"><span class="pct-num">' + pct + '%</span><div class="pct-bar-track"><div class="pct-bar-fill ' + pctClass(pct) + '" style="width:' + pct + '%"></div></div></div></td>' +
          '</tr>';
      });

      var totals = DAY_LABELS.map(function (_, dayIdx) {
        return state.habits.reduce(function (sum, h) {
          var checks = week.checks[h.id] || [];
          return sum + (checks[dayIdx] ? 1 : 0);
        }, 0);
      });
      html += '<tr class="total-row"><td class="habit-name-cell">Total</td>' +
        totals.map(function (t) { return '<td class="day-cell">' + t + '/' + state.habits.length + '</td>'; }).join('') +
        '<td class="pct-cell"></td></tr>';

      html += '</tbody></table></div>';
      html += '<button class="btn btn-primary btn-block" style="margin-top:.8rem" data-action="habit-add">+ Ajouter une habitude</button>';
    }

    panel.innerHTML = html;
  }

  function openHabitModal(habitId) {
    var editing = !!habitId;
    var habit = editing ? state.habits.find(function (h) { return h.id === habitId; }) : null;
    var html = '<h3>' + (editing ? "Modifier l'habitude" : 'Nouvelle habitude') + '</h3>' +
      '<input type="text" id="habit-name-input" placeholder="Nom de l\'habitude" value="' + (editing ? escapeHtml(habit.name) : '') + '" maxlength="60"/>' +
      '<div class="modal-actions">' +
      (editing ? '<button class="btn btn-danger" data-action="habit-delete">Supprimer</button>' : '') +
      '<button class="btn btn-ghost" data-action="modal-close">Annuler</button>' +
      '<button class="btn btn-primary" data-action="habit-save">' + (editing ? 'Enregistrer' : 'Ajouter') + '</button>' +
      '</div>';

    openModal(html, function (root) {
      var input = root.querySelector('#habit-name-input');
      input.focus();
      input.select();
      root.querySelector('[data-action="habit-save"]').addEventListener('click', function () {
        var name = input.value.trim();
        if (!name) { input.focus(); return; }
        if (editing) {
          habit.name = name;
          closeModal(); render();
        } else {
          var h = { id: uid(), name: name };
          state.habits.push(h);
          state.weeks.forEach(function (w) { w.checks[h.id] = emptyWeekChecks(); });
          closeModal(); render();
        }
      });
      if (editing) {
        root.querySelector('[data-action="habit-delete"]').addEventListener('click', function () {
          closeModal();
          openConfirm('Supprimer l\'habitude « ' + habit.name + ' » ? L\'historique associé sera perdu.', 'Supprimer', function () {
            state.habits = state.habits.filter(function (h) { return h.id !== habitId; });
            state.weeks.forEach(function (w) { delete w.checks[habitId]; });
            render();
            toast('Habitude supprimée');
          });
        });
      }
      root.querySelector('[data-action="modal-close"]').addEventListener('click', closeModal);
    });
  }

  function openWeekModal() {
    var week = currentWeek();
    var canDelete = state.weeks.length > 1;
    var html = '<h3>Modifier la semaine</h3>' +
      '<input type="text" id="week-label-input" value="' + escapeHtml(week.label) + '" maxlength="40"/>' +
      '<div class="modal-actions">' +
      (canDelete ? '<button class="btn btn-danger" data-action="week-delete">Supprimer</button>' : '') +
      '<button class="btn btn-ghost" data-action="modal-close">Annuler</button>' +
      '<button class="btn btn-primary" data-action="week-save">Enregistrer</button>' +
      '</div>';
    openModal(html, function (root) {
      var input = root.querySelector('#week-label-input');
      input.focus(); input.select();
      root.querySelector('[data-action="week-save"]').addEventListener('click', function () {
        var val = input.value.trim();
        if (val) week.label = val;
        closeModal(); render();
      });
      if (canDelete) {
        root.querySelector('[data-action="week-delete"]').addEventListener('click', function () {
          closeModal();
          openConfirm('Supprimer « ' + week.label + ' » et toutes ses données ?', 'Supprimer', function () {
            state.weeks = state.weeks.filter(function (w) { return w.id !== week.id; });
            state.activeWeek = Math.min(state.activeWeek, state.weeks.length - 1);
            render();
            toast('Semaine supprimée');
          });
        });
      }
      root.querySelector('[data-action="modal-close"]').addEventListener('click', closeModal);
    });
  }

  function addWeek() {
    var n = state.weeks.length + 1;
    var w = { id: uid(), label: 'Semaine ' + n, checks: {} };
    state.habits.forEach(function (h) { w.checks[h.id] = emptyWeekChecks(); });
    state.weeks.push(w);
    state.activeWeek = state.weeks.length - 1;
    render();
    toast('Nouvelle semaine créée');
  }

  function onHabitudesClick(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    if (action === 'toggle-check') {
      var week = currentWeek();
      var hid = btn.dataset.habit, day = +btn.dataset.day;
      if (!week.checks[hid]) week.checks[hid] = emptyWeekChecks();
      week.checks[hid][day] = !week.checks[hid][day];
      render();
    } else if (action === 'week-prev') {
      state.activeWeek = Math.max(0, state.activeWeek - 1); render();
    } else if (action === 'week-next') {
      state.activeWeek = Math.min(state.weeks.length - 1, state.activeWeek + 1); render();
    } else if (action === 'week-add') {
      addWeek();
    } else if (action === 'week-edit') {
      openWeekModal();
    } else if (action === 'habit-add') {
      openHabitModal(null);
    } else if (action === 'habit-edit') {
      openHabitModal(btn.dataset.habit);
    } else if (action === 'steps-sync') {
      syncSteps();
    } else if (action === 'open-connexions') {
      openConnexionsModal();
    }
  }

  function onHabitudesChange(e) {
    if (e.target.matches('[data-action="week-select"]')) {
      state.activeWeek = +e.target.value;
      render();
    }
  }

  // ═══════════════════════ SÉANCES ═══════════════════════

  function currentSeance() {
    if (state.activeSeance >= state.seances.length) state.activeSeance = Math.max(0, state.seances.length - 1);
    return state.seances[state.activeSeance];
  }

  function renderSeances() {
    var panel = document.getElementById('panel-seances');

    if (state.seances.length === 0) {
      panel.innerHTML = '<div class="empty-state"><p>Aucune séance pour l\'instant.</p>' +
        '<button class="btn btn-primary" data-action="seance-add">+ Créer une séance</button></div>';
      return;
    }

    var seance = currentSeance();
    var html = '<div class="seance-tabs">';
    state.seances.forEach(function (s, i) {
      html += '<button class="seance-chip ' + (i === state.activeSeance ? 'active' : '') + '" data-action="seance-select" data-index="' + i + '">' + escapeHtml(s.name || 'Sans nom') + '</button>';
    });
    html += '<button class="seance-chip" data-action="seance-add">+ Nouvelle</button></div>';

    html += '<div class="seance-card"><div class="seance-card-head">' +
      '<input class="seance-name-input" data-action="seance-rename" value="' + escapeHtml(seance.name) + '" maxlength="50" placeholder="Nom de la séance"/>' +
      '<button class="btn btn-icon btn-danger" data-action="seance-delete" aria-label="Supprimer la séance">🗑</button>' +
      '</div>';

    if (seance.items.length === 0) {
      html += '<p class="muted" style="padding:.5rem 0">Aucun exercice. Ajoutez-en un ci-dessous.</p>';
    } else {
      seance.items.forEach(function (item, idx) {
        if (item.type === 'recup') {
          html += '<div class="recup-row" data-item="' + item.id + '">' +
            '<span class="recup-badge">RÉCUP</span>' +
            '<input type="text" class="recup-input" data-action="recup-text" data-item="' + item.id + '" value="' + escapeHtml(item.text || '') + '" placeholder="ex : 90 sec de récupération"/>' +
            '<button class="row-menu-btn" data-action="item-menu" data-item="' + item.id + '" data-index="' + idx + '" aria-label="Options">⋮</button>' +
            '</div>';
        } else {
          html += '<div class="ex-row" data-item="' + item.id + '">' +
            '<div class="ex-drag"><span class="ex-num">' + (idx + 1) + '</span></div>' +
            '<div class="ex-fields">' +
            '<input type="text" class="ex-name" data-action="ex-field" data-field="name" data-item="' + item.id + '" value="' + escapeHtml(item.name || '') + '" placeholder="Nom de l\'exercice"/>' +
            '<div class="ex-field-group"><label>Séries</label><input type="text" data-action="ex-field" data-field="series" data-item="' + item.id + '" value="' + escapeHtml(item.series || '') + '" placeholder="4"/></div>' +
            '<div class="ex-field-group"><label>Répétitions</label><input type="text" data-action="ex-field" data-field="reps" data-item="' + item.id + '" value="' + escapeHtml(item.reps || '') + '" placeholder="15, Max hold, 4min..."/></div>' +
            '<div class="ex-field-group" style="grid-column:1/-1"><label>Récup / fréquence</label><input type="text" data-action="ex-field" data-field="rest" data-item="' + item.id + '" value="' + escapeHtml(item.rest || '') + '" placeholder="60 sec"/></div>' +
            '<div class="ex-row-tools"><button class="row-menu-btn" data-action="item-menu" data-item="' + item.id + '" data-index="' + idx + '" aria-label="Options">⋮ Options</button></div>' +
            '</div></div>';
        }
      });
    }

    html += '<div class="add-row-actions">' +
      '<button class="btn" data-action="item-add-exercise">+ Exercice</button>' +
      '<button class="btn btn-sun" data-action="item-add-recup">+ Récup</button>' +
      '</div>';

    html += '<div class="seance-note"><label for="seance-note-input">Notes</label>' +
      '<textarea id="seance-note-input" data-action="seance-note" placeholder="Consignes détaillées, ex : 30 min de marche : 5min tranquille puis 20min soutenu...">' + escapeHtml(seance.note || '') + '</textarea>' +
      '</div></div>';

    panel.innerHTML = html;
  }

  function swapItems(seance, i, j) {
    var tmp = seance.items[i];
    seance.items[i] = seance.items[j];
    seance.items[j] = tmp;
  }

  function openItemMenu(seance, itemId, index) {
    var item = seance.items[index];
    var isFirst = index === 0, isLast = index === seance.items.length - 1;
    var title = item.type === 'recup' ? 'Récupération' : (item.name || 'Exercice');
    var html = '<h3>' + escapeHtml(title) + '</h3><div style="display:flex;flex-direction:column;gap:.5rem">' +
      '<button class="btn btn-block" data-action="mv-up" ' + (isFirst ? 'disabled' : '') + '>▲ Monter</button>' +
      '<button class="btn btn-block" data-action="mv-down" ' + (isLast ? 'disabled' : '') + '>▼ Descendre</button>' +
      '<button class="btn btn-sun btn-block" data-action="ins-exercise">+ Insérer un exercice après</button>' +
      '<button class="btn btn-sun btn-block" data-action="ins-recup">+ Insérer une récup après</button>' +
      '<button class="btn btn-danger btn-block" data-action="del-item">🗑 Supprimer cette ligne</button>' +
      '<button class="btn btn-ghost btn-block" data-action="modal-close">Annuler</button>' +
      '</div>';
    openModal(html, function (root) {
      if (!isFirst) root.querySelector('[data-action="mv-up"]').addEventListener('click', function () { swapItems(seance, index, index - 1); closeModal(); render(); });
      if (!isLast) root.querySelector('[data-action="mv-down"]').addEventListener('click', function () { swapItems(seance, index, index + 1); closeModal(); render(); });
      root.querySelector('[data-action="ins-exercise"]').addEventListener('click', function () { seance.items.splice(index + 1, 0, newExercise()); closeModal(); render(); });
      root.querySelector('[data-action="ins-recup"]').addEventListener('click', function () { seance.items.splice(index + 1, 0, newRecup()); closeModal(); render(); });
      root.querySelector('[data-action="del-item"]').addEventListener('click', function () { seance.items.splice(index, 1); closeModal(); render(); });
      root.querySelector('[data-action="modal-close"]').addEventListener('click', closeModal);
    });
  }

  function addSeance() {
    var s = { id: uid(), name: 'Nouvelle séance', items: [], note: '' };
    state.seances.push(s);
    state.activeSeance = state.seances.length - 1;
    render();
  }

  function deleteCurrentSeance() {
    var s = currentSeance();
    openConfirm('Supprimer la séance « ' + (s.name || 'Sans nom') + ' » ?', 'Supprimer', function () {
      var idx = state.seances.indexOf(s);
      state.seances.splice(idx, 1);
      state.activeSeance = Math.max(0, state.activeSeance - 1);
      render();
      toast('Séance supprimée');
    });
  }

  function renderSeanceChipsOnly() {
    var s = currentSeance();
    var chip = document.querySelector('.seance-chip[data-index="' + state.activeSeance + '"]');
    if (chip) chip.textContent = s.name || 'Sans nom';
  }

  function onSeancesClick(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    if (action === 'seance-add') {
      addSeance();
    } else if (action === 'seance-select') {
      state.activeSeance = +btn.dataset.index; render();
    } else if (action === 'seance-delete') {
      deleteCurrentSeance();
    } else if (action === 'item-add-exercise') {
      currentSeance().items.push(newExercise()); render();
    } else if (action === 'item-add-recup') {
      currentSeance().items.push(newRecup()); render();
    } else if (action === 'item-menu') {
      openItemMenu(currentSeance(), btn.dataset.item, +btn.dataset.index);
    }
  }

  function onSeancesInput(e) {
    var el = e.target;
    var s = currentSeance();
    if (el.matches('[data-action="seance-rename"]')) {
      s.name = el.value;
      persist();
      renderSeanceChipsOnly();
    } else if (el.matches('[data-action="seance-note"]')) {
      s.note = el.value;
      persist();
    } else if (el.matches('[data-action="ex-field"]')) {
      var item = s.items.find(function (it) { return it.id === el.dataset.item; });
      if (item) item[el.dataset.field] = el.value;
      persist();
    } else if (el.matches('[data-action="recup-text"]')) {
      var recupItem = s.items.find(function (it) { return it.id === el.dataset.item; });
      if (recupItem) recupItem.text = el.value;
      persist();
    }
  }

  // ═══════════════════════ INIT ═══════════════════════

  function init() {
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.activeTab = btn.dataset.tab;
        render();
      });
    });
    document.getElementById('panel-habitudes').addEventListener('click', onHabitudesClick);
    document.getElementById('panel-habitudes').addEventListener('change', onHabitudesChange);
    document.getElementById('panel-seances').addEventListener('click', onSeancesClick);
    document.getElementById('panel-seances').addEventListener('input', onSeancesInput);
    document.querySelector('.topbar-settings').addEventListener('click', openConnexionsModal);
    render();

    if (backendConfigured()) {
      syncSteps(true);
      setInterval(function () { if (backendConfigured()) syncSteps(true); }, 5 * 60 * 1000);
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden && backendConfigured()) syncSteps(true);
      });
    }
  }

  init();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (err) {
        console.warn('Échec de l\'enregistrement du service worker', err);
      });
    });
  }
})();
