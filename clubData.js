/* Zabrežje Tennis Club — shared data, i18n and local-storage state.
   Plain browser script: exposes window.ClubData (static) and window.ClubStore (persisted).
   Each of the 4 leagues is split into 3 point-based tournaments; standings are computed
   from the match schedule (win = 3 points) so results genuinely drive the tables. */
(function () {
  "use strict";

  var LEAGUES = ["A", "B", "C", "D"];
  var ADMIN_EMAIL = "admin@tkz.rs";

  var LEAGUE_META = {
    A: { color: "#1f6b3a", name_en: "Premier League", name_sr: "Premijer liga" },
    B: { color: "#c0562a", name_en: "First League", name_sr: "Prva liga" },
    C: { color: "#8a6a2f", name_en: "Second League", name_sr: "Druga liga" },
    D: { color: "#5b7a2e", name_en: "Recreational", name_sr: "Rekreativna liga" }
  };

  // 3 tournaments per league. months are 0-indexed (3=April … 8=September).
  var TOURNAMENTS = [
    { id: "t1", en: "April / May", sr: "April / Maj", months: [3, 4] },
    { id: "t2", en: "June / July", sr: "Jun / Jul", months: [5, 6] },
    { id: "t3", en: "August / September", sr: "Avgust / Septembar", months: [7, 8] }
  ];
  function tournamentOf(iso) {
    var m = parseInt(iso.slice(5, 7), 10) - 1;
    for (var i = 0; i < TOURNAMENTS.length; i++) if (TOURNAMENTS[i].months.indexOf(m) >= 0) return TOURNAMENTS[i].id;
    return null;
  }

  var FIRST = ["Nikola","Marko","Stefan","Miloš","Luka","Aleksandar","Vladimir","Nemanja","Dušan","Filip",
    "Uroš","Petar","Lazar","Vukašin","Ognjen","Bogdan","Andrej","Đorđe","Miljan","Strahinja",
    "Relja","Vojin","Pavle","Danilo","Ilija","Mihailo","Teodor","Damjan","Rade","Zoran"];
  var LAST = ["Jovanović","Petrović","Nikolić","Marković","Đorđević","Stojanović","Ilić","Pavlović","Milošević","Kovačević",
    "Popović","Lukić","Ristić","Todorović","Đukić","Savić","Nedeljković","Vasić","Cvetković","Radovanović",
    "Blagojević","Mitrović","Živković","Obradović","Stanković","Vuković","Aleksić","Simić","Božić","Damjanović"];
  var CITIES = ["Obrenovac","Beograd","Šabac","Valjevo","Lazarevac","Ub","Vladimirci","Barič","Zabrežje","Ostružnica"];

  function seeded(seed) {
    var s = seed % 2147483647; if (s <= 0) s += 2147483646;
    return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }
  function slugName(n) {
    return n.toLowerCase().replace(/č|ć/g, "c").replace(/š/g, "s").replace(/ž/g, "z").replace(/đ/g, "dj")
      .replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");
  }

  function buildPlayers() {
    var players = [];
    LEAGUES.forEach(function (lg, li) {
      var rnd = seeded((li + 1) * 7919);
      for (var i = 0; i < 20; i++) {
        var fn = FIRST[Math.floor(rnd() * FIRST.length)];
        var ln = LAST[Math.floor(rnd() * LAST.length)];
        var name = fn + " " + ln;
        var id = lg + "-" + (i + 1);
        players.push({
          id: id, league: lg, name: name,
          email: slugName(name) + (i + 1) + "@tkz.rs",
          city: CITIES[Math.floor(rnd() * CITIES.length)],
          age: 18 + Math.floor(rnd() * 32),
          hand: rnd() < 0.85 ? "right" : "left",
          height: 172 + Math.floor(rnd() * 26),
          plays_since: 2015 + Math.floor(rnd() * 9),
          strength: 0.35 + rnd() * 0.6   // hidden skill so better players win more
        });
      }
    });
    return players;
  }

  var PLAYERS = buildPlayers();
  var PLAYERS_BY_ID = {};
  PLAYERS.forEach(function (p) { PLAYERS_BY_ID[p.id] = p; });
  function playersIn(lg) { return PLAYERS.filter(function (p) { return p.league === lg; }); }

  // Round-robin-ish schedule: each tournament = 9 rounds, every player one match per round.
  function buildMatches() {
    var matches = [];
    LEAGUES.forEach(function (lg, li) {
      var ps = playersIn(lg);
      var rnd = seeded((li + 1) * 104729);
      TOURNAMENTS.forEach(function (tt) {
        var start = new Date(2026, tt.months[0], 3);
        for (var r = 0; r < 9; r++) {
          var order = ps.slice();
          for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var tmp = order[i]; order[i] = order[j]; order[j] = tmp; }
          var mdate = new Date(start.getTime() + r * 6 * 86400000);
          var dateStr = mdate.toISOString().slice(0, 10);
          var isPast = mdate.getTime() < Date.now();
          for (var k = 0; k + 1 < order.length; k += 2) {
            var a = order[k], b = order[k + 1];
            var m = { id: lg + "-" + tt.id + "-r" + r + "-" + k, league: lg, tournament: tt.id,
              a: a.id, b: b.id, date: dateStr, time: (17 + Math.floor(rnd() * 5)) + ":00",
              court: 1 + Math.floor(rnd() * 2), status: isPast ? "played" : "scheduled", score: null, winner: null };
            if (isPast) {
              var aWins = rnd() < a.strength / (a.strength + b.strength);
              var loserG = Math.floor(rnd() * 8); // 0..7 games for the loser; winner reaches 9
              m.score = aWins ? ("9-" + loserG) : (loserG + "-9");
              m.winner = aWins ? a.id : b.id;
            }
            matches.push(m);
          }
        }
      });
    });
    return matches;
  }

  var MATCHES = buildMatches();

  function parseSets(score) {
    // matches are played to 9 games; parse the single "X-Y" game score.
    var a = 0, b = 0;
    var m = (score || "").match(/(\d+)\s*[-:]\s*(\d+)/);
    if (m) { a = +m[1]; b = +m[2]; }
    return { a: a, b: b };
  }

  var I18N = {
    en: {
      nav_home: "Home", nav_leagues: "Leagues", nav_reserve: "Reservations", nav_about: "About", nav_contact: "Contact",
      login: "Log in", logout: "Log out", skip: "Enter as guest", admin: "Admin",
      season: "Season", season_val: "April – October 2026",
      hero_title: "Play the league in your town, with your friends.",
      hero_sub: "Two clay courts on the bank of the Sava. Four closed leagues, one clubhouse, and the people who make Zabrežje worth the drive.",
      hero_cta_leagues: "View live standings", hero_cta_reserve: "Book a court",
      about_kicker: "The club", about_title: "A river, a treeline, and two clay courts.",
      about_body: "Zabrežje Tennis Club sits on the bank of the Sava in Obrenovac — river on one side, a wall of old trees on the other. It is a members' club that runs four seasonal leagues from April into October.",
      amen_title: "What you'll find here",
      standings_title: "Live standings", standings_sub: "Updated by the players, in real time.",
      played: "P", won: "W", lost: "L", points: "Pts", form: "Form", rank: "#", player: "Player",
      matches_title: "Matches & results", upcoming: "Upcoming", recent: "Recent results",
      edit_result: "Edit result", save: "Save", cancel: "Cancel",
      reserve_title: "Reserve a court", reserve_sub: "90-minute slots, 08:00 to midnight, on either clay court.",
      court: "Court", available: "Available", booked: "Booked", book: "Book",
      contact_title: "Come play", phone: "Phone", email: "Email", address: "Address", instagram: "Instagram",
      profile: "Profile", overview: "Overview", results_tab: "Results", stats_tab: "Statistics",
      current_form: "Current form", win_rate: "Win rate", ranking: "Ranking",
      about_player: "About", plays: "Playing since", hand: "Plays", height: "Height",
      right: "Right-handed", left: "Left-handed",
      login_title: "Members' log in", login_sub: "League players sign in to edit results and book courts.",
      login_email: "Email address", login_name: "Full name", login_submit: "Continue",
      pending_msg: "Thanks — your account is waiting for the club admin to approve it and place you in a league. You can browse the site meanwhile.",
      welcome_back: "Welcome back", your_league: "Your league",
      guest_note: "You're browsing as a guest. Log in as a league member to edit results and book courts.",
      admin_title: "Admin — approve members", pending: "Pending approvals", no_pending: "No pending requests.",
      approve: "Into", members: "Members", locked: "Log in to your league to edit",
      wrong_league: "You can only edit results in your own league.",
      view_profile: "View profile", back: "Back", vs: "vs", today: "Today",
      tournament: "Tournament", season_total: "Season total", by_tournament: "By tournament",
      not_started: "This tournament hasn't started yet — here is the fixture list.",
      status_done: "Completed", status_live: "In progress", status_soon: "Starts soon", starts: "Starts"
    },
    sr: {
      nav_home: "Početna", nav_leagues: "Lige", nav_reserve: "Rezervacije", nav_about: "O klubu", nav_contact: "Kontakt",
      login: "Prijava", logout: "Odjava", skip: "Uđi kao gost", admin: "Admin",
      season: "Sezona", season_val: "April – Oktobar 2026",
      hero_title: "Igraj ligu u svom gradu sa svojim prijateljima.",
      hero_sub: "Dva terena sa šljakom na obali Save. Četiri zatvorene lige, jedan klub i ljudi zbog kojih se na Zabrežje isplati doći.",
      hero_cta_leagues: "Pogledaj tabelu", hero_cta_reserve: "Zakaži termin",
      about_kicker: "Klub", about_title: "Reka, drvored i dva terena sa šljakom.",
      about_body: "Teniski klub Zabrežje se nalazi na obali Save u Obrenovcu — reka sa jedne, red starih stabala sa druge strane. To je članski klub u kom se odigravaju četiri sezonske lige koje traju od aprila do oktobra.",
      amen_title: "Šta vas ovde čeka",
      standings_title: "Live tabela", standings_sub: "Ažuriraju je sami igrači, u realnom vremenu.",
      played: "O", won: "P", lost: "I", points: "Bod", form: "Forma", rank: "#", player: "Igrač",
      matches_title: "Mečevi i rezultati", upcoming: "Naredni", recent: "Odigrano",
      edit_result: "Izmeni rezultat", save: "Sačuvaj", cancel: "Otkaži",
      reserve_title: "Rezerviši teren", reserve_sub: "Termini od 90 minuta, od 08:00 do ponoći, na oba šljaka terena.",
      court: "Teren", available: "Slobodno", booked: "Zauzeto", book: "Zakaži",
      contact_title: "Dođi da igraš", phone: "Telefon", email: "Mejl", address: "Adresa", instagram: "Instagram",
      profile: "Profil", overview: "Pregled", results_tab: "Rezultati", stats_tab: "Statistika",
      current_form: "Trenutna forma", win_rate: "Procenat pobeda", ranking: "Plasman",
      about_player: "O igraču", plays: "Igra od", hand: "Igra", height: "Visina",
      right: "Desnoruki", left: "Levoruki",
      login_title: "Prijava članova", login_sub: "Igrači lige se prijavljuju da menjaju rezultate i zakazuju termine.",
      login_email: "Mejl adresa", login_name: "Ime i prezime", login_submit: "Nastavi",
      pending_msg: "Hvala — nalog čeka da ga admin kluba odobri i rasporedi u ligu. U međuvremenu možeš da razgledaš sajt.",
      welcome_back: "Dobro došao nazad", your_league: "Tvoja liga",
      guest_note: "Razgledaš kao gost. Prijavi se kao član lige da menjaš rezultate i zakazuješ termine.",
      admin_title: "Admin — odobravanje članova", pending: "Zahtevi na čekanju", no_pending: "Nema zahteva na čekanju.",
      approve: "U", members: "Članovi", locked: "Prijavi se u svoju ligu za izmene",
      wrong_league: "Rezultate možeš da menjaš samo u svojoj ligi.",
      view_profile: "Pogledaj profil", back: "Nazad", vs: "—", today: "Danas",
      tournament: "Turnir", season_total: "Ukupno u sezoni", by_tournament: "Po turniru",
      not_started: "Ovaj turnir još nije počeo — evo rasporeda mečeva.",
      status_done: "Završeno", status_live: "U toku", status_soon: "Uskoro počinje", starts: "Počinje"
    }
  };

  var AMENITIES = [
    { icon: "tennis-ball", en: "2 clay courts", sr: "2 šljaka terena" },
    { icon: "coffee", en: "Café & bar", sr: "Kafić i bar" },
    { icon: "circles-three", en: "Ball sales", sr: "Prodaja loptica" },
    { icon: "wrench", en: "Racket stringing", sr: "Španovanje reketa" },
    { icon: "toilet", en: "Toilets", sr: "Toaleti" },
    { icon: "shower", en: "Showers", sr: "Tuševi" },
    { icon: "car", en: "Parking", sr: "Parking" },
    { icon: "lightbulb", en: "Lighting for night play", sr: "Reflektori za noćnu igru" },
    { icon: "graduation-cap", en: "Coaching & lessons", sr: "Treninzi i škola tenisa" }
  ];

  var CONTACT = {
    phone: "+381 64 218 77 05", email: "info@tkzabrezje.rs",
    address_en: "Zabrežje, Obrenovac, Serbia", address_sr: "Zabrežje, Obrenovac, Srbija",
    instagram: "teniski_klub_zabrezje", instagram_url: "https://instagram.com/teniski_klub_zabrezje"
  };

  window.ClubData = {
    LEAGUES: LEAGUES, LEAGUE_META: LEAGUE_META, ADMIN_EMAIL: ADMIN_EMAIL,
    TOURNAMENTS: TOURNAMENTS, tournamentOf: tournamentOf,
    PLAYERS: PLAYERS, PLAYERS_BY_ID: PLAYERS_BY_ID, MATCHES: MATCHES,
    I18N: I18N, AMENITIES: AMENITIES, CONTACT: CONTACT,
    playersIn: playersIn,
    leagueName: function (lg, lang) { return LEAGUE_META[lg]["name_" + (lang || "en")]; },
    tournamentName: function (tid, lang) { var t = TOURNAMENTS.filter(function (x) { return x.id === tid; })[0]; return t ? t[lang || "en"] : tid; }
  };

  // ---------- persisted store ----------
  var K = { lang: "tkz_lang", users: "tkz_users", session: "tkz_session",
            results: "tkz_results", reservations: "tkz_reservations" };
  function read(k, fb) { try { var v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch (e) { return fb; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function ensureSeedUsers() {
    var users = read(K.users, null);
    if (users) return users;
    users = [{ email: ADMIN_EMAIL, name: "Club Admin", league: null, status: "approved", isAdmin: true }];
    PLAYERS.forEach(function (p) {
      users.push({ email: p.email, name: p.name, league: p.league, status: "approved", isAdmin: false, playerId: p.id });
    });
    write(K.users, users);
    return users;
  }

  var Store = {
    keys: K,
    getLang: function () { return read(K.lang, "en"); },
    setLang: function (l) { write(K.lang, l); document.dispatchEvent(new CustomEvent("tkz-lang", { detail: l })); },

    users: function () { return ensureSeedUsers(); },
    findUser: function (email) { email = (email || "").trim().toLowerCase(); return this.users().filter(function (u) { return u.email.toLowerCase() === email; })[0] || null; },
    session: function () { var email = read(K.session, null); return email ? this.findUser(email) : null; },
    login: function (email, name) {
      email = (email || "").trim();
      var existing = this.findUser(email);
      if (existing) { if (existing.status === "approved") { write(K.session, existing.email); return { ok: true, user: existing }; } return { ok: false, reason: "pending", user: existing }; }
      var users = this.users();
      var u = { email: email, name: (name || email.split("@")[0]), league: null, status: "pending", isAdmin: false };
      users.push(u); write(K.users, users);
      return { ok: false, reason: "pending", user: u };
    },
    logout: function () { write(K.session, null); },
    pending: function () { return this.users().filter(function (u) { return u.status === "pending"; }); },
    approve: function (email, league) {
      var users = this.users();
      users.forEach(function (u) { if (u.email === email) { u.status = "approved"; u.league = league; } });
      write(K.users, users);
    },

    results: function () { return read(K.results, {}); },
    setResult: function (matchId, score, winnerId) {
      var r = this.results(); r[matchId] = { score: score, winner: winnerId }; write(K.results, r);
      document.dispatchEvent(new CustomEvent("tkz-results"));
    },

    // which tournament is "current" for a default view (latest one that has started)
    currentTournament: function () {
      var now = Date.now(), pick = TOURNAMENTS[0].id;
      TOURNAMENTS.forEach(function (t) { if (new Date(2026, t.months[0], 3).getTime() <= now) pick = t.id; });
      return pick;
    },
    tournamentStatus: function (tid) {
      var t = TOURNAMENTS.filter(function (x) { return x.id === tid; })[0];
      var now = Date.now();
      var start = new Date(2026, t.months[0], 3).getTime();
      var end = new Date(2026, t.months[1], 27).getTime();
      if (now < start) return "soon";
      if (now > end) return "done";
      return "live";
    },

    matchesFor: function (lg, tid) {
      var overrides = this.results();
      return MATCHES.filter(function (m) { return m.league === lg && (!tid || m.tournament === tid); }).map(function (m) {
        var o = overrides[m.id];
        if (o) return Object.assign({}, m, { score: o.score, winner: o.winner, status: "played" });
        return m;
      });
    },

    standings: function (lg, tid) {
      var stat = {};
      playersIn(lg).forEach(function (p) { stat[p.id] = { id: p.id, name: p.name, played: 0, won: 0, lost: 0, points: 0, setsW: 0, setsL: 0, _res: [] }; });
      var overrides = this.results();
      MATCHES.filter(function (m) { return m.league === lg && (!tid || m.tournament === tid); }).forEach(function (m) {
        var o = overrides[m.id];
        var played = m.status === "played" || !!o;
        if (!played) return;
        var winner = o ? o.winner : m.winner;
        var score = o ? o.score : m.score;
        var A = stat[m.a], B = stat[m.b];
        if (!A || !B) return;
        A.played++; B.played++;
        if (winner === m.a) { A.won++; A.points += 3; B.lost++; }
        else if (winner === m.b) { B.won++; B.points += 3; A.lost++; }
        var s = parseSets(score);
        A.setsW += s.a; A.setsL += s.b; B.setsW += s.b; B.setsL += s.a;
        A._res.push({ d: m.date, w: winner === m.a }); B._res.push({ d: m.date, w: winner === m.b });
      });
      var rows = Object.keys(stat).map(function (k) {
        var r = stat[k];
        r.form = r._res.sort(function (x, y) { return x.d < y.d ? -1 : 1; }).slice(-5).map(function (e) { return e.w ? "W" : "L"; });
        delete r._res; return r;
      });
      return rows.sort(function (a, b) {
        if (b.points !== a.points) return b.points - a.points;
        if ((b.setsW - b.setsL) !== (a.setsW - a.setsL)) return (b.setsW - b.setsL) - (a.setsW - a.setsL);
        return a.name < b.name ? -1 : 1;
      });
    },

    // aggregate a player's row across all tournaments in their league
    playerSeason: function (pid) {
      var p = PLAYERS_BY_ID[pid]; if (!p) return null;
      var agg = { played: 0, won: 0, lost: 0, points: 0, setsW: 0, setsL: 0, form: [] };
      var perT = [];
      var self = this;
      TOURNAMENTS.forEach(function (t) {
        var st = self.standings(p.league, t.id);
        var row = st.filter(function (r) { return r.id === pid; })[0];
        var rank = st.map(function (r) { return r.id; }).indexOf(pid) + 1;
        if (row) {
          agg.played += row.played; agg.won += row.won; agg.lost += row.lost;
          agg.points += row.points; agg.setsW += row.setsW; agg.setsL += row.setsL;
          agg.form = agg.form.concat(row.form);
        }
        perT.push({ id: t.id, played: row ? row.played : 0, won: row ? row.won : 0, points: row ? row.points : 0, rank: (row && row.played) ? rank : null });
      });
      agg.form = agg.form.slice(-5);
      // current streak
      var streak = 0; for (var i = agg.form.length - 1; i >= 0; i--) { if (agg.form[i] === "W") streak++; else break; }
      agg.streak = streak;
      return { agg: agg, perTournament: perT };
    },

    reservations: function () { return read(K.reservations, []); },
    reservationAt: function (court, date, time) { return this.reservations().filter(function (r) { return r.court === court && r.date === date && r.time === time; })[0] || null; },
    addReservation: function (court, date, time, name, email) {
      var list = this.reservations();
      list.push({ id: "r" + Date.now(), court: court, date: date, time: time, name: name, email: email });
      write(K.reservations, list); document.dispatchEvent(new CustomEvent("tkz-reservations"));
    },
    cancelReservation: function (id) {
      write(K.reservations, this.reservations().filter(function (r) { return r.id !== id; }));
      document.dispatchEvent(new CustomEvent("tkz-reservations"));
    }
  };

  window.ClubStore = Store;
})();
