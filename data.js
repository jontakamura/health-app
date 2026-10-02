/* Health Bot — seed data: exercise library, swap rules, templates, imported history.
   Derived from Jon's training log 7/19 – 10/3 (2026). */
(function () {
  // fields: c = checkbox only, r = reps, w = weight, t = time (sec)
  // cat: warmup | core | prehab | plyo | strength | iso | accessory
  // back / shoulder: swap target id, array of candidates (first not already in session), or 'remove'
  const LIB = [
    // ---- warm-up / core / prehab
    ['warmup', 'Warm up', 'c', 'warmup'],
    ['core', 'Core', 'c', 'core'],
    ['shoulder_prehab', 'Shoulder prehab', 'c', 'prehab'],
    ['mcgill', 'McGill Big 3 (curl-up · side plank · bird dog)', 'r', 'core'],
    ['superman_rot', 'Superman → behind-the-back arm rotations', 'r', 'prehab'],
    ['cat_camel', 'Cat-camel (gentle, pain-free range)', 'r', 'prehab'],
    ['bird_dog', 'Bird dog (slow, braced)', 'r', 'core'],
    ['dead_bug', 'Dead bug', 'r', 'core'],
    ['side_plank', 'Side plank', 't', 'core'],
    ['stir_pot', 'Stir the pot', 'r', 'core'],
    ['pallof', 'Pallof press', 'rw', 'core'],
    ['hip_flexor_stretch', 'Half-kneeling hip flexor stretch', 't', 'prehab'],
    ['glute_bridge', 'Glute bridge (paused)', 'rw', 'strength'],
    ['band_er', 'Band external rotation (R shoulder focus)', 'r', 'prehab'],
    ['band_pull_apart', 'Band pull-aparts', 'r', 'prehab'],
    ['scap_wall_slide', 'Scap wall slides', 'r', 'prehab'],
    ['prone_ytw', 'Prone Y-T-W on incline bench (light)', 'rw', 'prehab'],
    ['face_pull', 'Face pulls', 'rw', 'prehab'],
    // ---- lower: plyo
    ['assisted_plyo', 'Assisted plyometrics (band-assisted jumps)', 'r', 'plyo'],
    ['blain_broad', 'Blain broad jump (from seated)', 'r', 'plyo'],
    ['knee_tuck', 'Knee tuck squat jumps', 'r', 'plyo', { back: 'pogo_hops' }],
    ['depth_drop_jump', 'Depth drops & explosive jump', 'r', 'plyo', { back: 'box_jump_step' }],
    ['depth_drop', 'Depth drops', 'r', 'plyo', { back: 'box_jump_step' }],
    ['deep_squat_hops', 'Deep squat hops', 'r', 'plyo', { back: 'remove' }],
    ['box_jumps_consec', 'Consecutive box jumps', 'r', 'plyo', { back: ['box_jump_step', 'remove'] }],
    ['box_jump_step', 'Box jump (step down, soft landing)', 'r', 'plyo'],
    ['pogo_hops', 'Low pogo hops', 'r', 'plyo'],
    ['split_squat_jumps', 'Split squat jumps', 'r', 'plyo', { back: 'remove' }],
    ['altitude_drops', 'Altitude drops', 'r', 'plyo'],
    ['sl_altitude_drops', 'SL altitude drops', 'r', 'plyo'],
    // ---- lower: strength / iso
    ['squat_5x5x', 'Back squat 5·5·X (ecc / hold / concentric)', 'rw', 'strength', { back: 'goblet_box_squat' }],
    ['heels_elev_squat', 'Heels-elevated full squat', 'rw', 'strength', { back: 'goblet_box_squat' }],
    ['box_squat_jump', 'Box squat → jump over box', 'rw', 'strength', { back: 'goblet_box_squat' }],
    ['goblet_box_squat', 'Goblet box squat (or belt squat)', 'rw', 'strength'],
    ['belt_squat', 'Belt squat', 'rw', 'strength'],
    ['sgdl_band', 'Snatch-grip DL (band around knees)', 'rw', 'strength', { back: ['physio_curl', 'reverse_hyper', 'glute_bridge'] }],
    ['physio_curl', 'Physio ball leg curls', 'r', 'strength'],
    ['reverse_hyper', 'Reverse hyper (light, controlled)', 'rw', 'strength'],
    ['ghr_explosive', 'GHR — 10s hold + explosive reps', 'trw', 'strength'],
    ['ghr_hold', 'GHR hold', 't', 'iso'],
    ['cable_hip_flexor', 'Cable hands-and-knees hip flexor (each)', 'rw', 'strength'],
    ['sl_back_ext', 'SL 45° back extension', 'rw', 'strength', { back: 'bird_dog' }],
    ['supramax_ecc', 'Supramaximal eccentrics', 'rw', 'strength', { back: 'wall_sit' }],
    ['oc_iso_wall_squat', 'Overcoming iso — wall squat', 'tr', 'iso'],
    ['oc_iso_sl_wall_squat', 'Overcoming iso — SL wall squat (each)', 'tr', 'iso'],
    ['wall_sit', 'Wall sit', 't', 'iso'],
    ['bulgarian_iso', 'Bulgarian split squat iso hold', 't', 'iso'],
    ['sl_hang', 'SL hang', 't', 'iso'],
    ['super_slow_squat', 'Super slow squat', 'rw', 'strength', { back: 'goblet_box_squat' }],
    ['super_slow_rdl', 'Super slow RDL', 'rw', 'strength', { back: ['physio_curl', 'glute_bridge'] }],
    ['bb_clean_pause', 'BB clean (pause at top of shin)', 'rw', 'strength', { back: 'remove' }],
    ['reverse_lunge_db', 'Reverse lunge (DB in front-leg-side hand)', 'rw', 'strength'],
    ['lunge_hold_jump', 'Lunge hold → split squat jumps', 'tr', 'plyo', { back: 'remove' }],
    // ---- upper
    ['plyo_pushup', 'Plyo push-ups', 'r', 'plyo', { shoulder: 'incline_pushup' }],
    ['explosive_pushup', 'Explosive push-ups', 'r', 'plyo', { shoulder: 'incline_pushup' }],
    ['mb_front', 'Med ball throw — front', 'r', 'plyo', { shoulder: 'remove' }],
    ['mb_side', 'Med ball throw — sides (each)', 'r', 'plyo', { back: 'remove' }],
    ['pullup_iso_explosive', 'Pull-up — 10s iso hold + explosive reps', 'trw', 'strength', { shoulder: 'pulldown_iso_explosive' }],
    ['pulldown_iso_explosive', 'Neutral-grip pulldown — iso hold + explosive', 'trw', 'strength'],
    ['cgbench_iso_rebound', 'Close-grip bench overcoming iso 10s + rebound push-ups', 'trw', 'strength', { shoulder: ['floor_press_iso', 'neutral_db_floor_press'] }],
    ['rebounds', 'Rebounds', 'r', 'plyo', { shoulder: 'remove' }],
    ['lat_raise', 'Lateral raises', 'rw', 'accessory', { shoulder: 'scaption' }],
    ['scaption', 'Thumbs-up scaption raise (light, below shoulder height)', 'rw', 'accessory'],
    ['bo_front_raise', 'Bent-over front raises', 'rw', 'accessory', { back: 'prone_ytw', shoulder: 'prone_ytw' }],
    ['bear_db_row', 'Bear-stance DB row (each)', 'rw', 'strength'],
    ['bb_bench_perfect', 'Perfect-form BB bench', 'rw', 'strength', { shoulder: ['neutral_db_floor_press', 'landmine_press', 'cable_press'] }],
    ['chin_up', 'Chin-ups', 'rw', 'strength', { shoulder: ['neutral_pulldown', 'chest_supported_row'] }],
    ['guillotine_incline', 'Incline guillotine press', 'rw', 'strength', { shoulder: ['landmine_press', 'cable_press', 'neutral_db_floor_press'] }],
    ['bench_paused', 'Bench press — pause at bottom, explode up', 'rw', 'strength', { shoulder: ['neutral_db_floor_press', 'landmine_press', 'cable_press'] }],
    ['db_bench_paused', 'DB bench — pause at bottom, explode up', 'rw', 'strength', { shoulder: ['neutral_db_floor_press', 'landmine_press', 'cable_press'] }],
    ['tbar_row', 'T-bar row', 'rw', 'strength', { back: 'chest_supported_row' }],
    ['db_row', 'DB row', 'rw', 'strength'],
    ['chest_supported_row', 'Chest-supported row', 'rw', 'strength'],
    ['pullup', 'Pull-ups', 'rw', 'strength', { shoulder: 'neutral_pulldown' }],
    ['pullup_cluster', 'Pull-ups — cluster 3·3·3 (10s between)', 'rw', 'strength', { shoulder: 'neutral_pulldown' }],
    ['neutral_pulldown', 'Neutral-grip lat pulldown', 'rw', 'strength'],
    ['cable_triceps', 'Cable triceps pushdown', 'rw', 'accessory'],
    ['curls', 'Curls', 'rw', 'accessory'],
    ['landmine_press', 'Half-kneeling landmine press', 'rw', 'strength'],
    ['neutral_db_floor_press', 'Neutral-grip DB floor press', 'rw', 'strength'],
    ['floor_press_iso', 'Neutral-grip DB floor press — 10s iso + controlled reps', 'trw', 'strength'],
    ['cable_press', 'Half-kneeling single-arm cable press', 'rw', 'strength'],
    ['incline_pushup', 'Incline push-up (hands elevated, controlled)', 'r', 'strength'],
    ['pullup_iso', 'Pull-up iso hold', 'tw', 'iso', { shoulder: 'neutral_pulldown_iso' }],
    ['neutral_pulldown_iso', 'Neutral-grip pulldown iso hold', 'tw', 'iso'],
    ['pushup_iso', 'Push-up iso hold', 't', 'iso', { shoulder: 'incline_pushup_iso' }],
    ['incline_pushup_iso', 'Incline push-up iso hold', 't', 'iso'],
    ['inv_row_iso', 'Inverted row iso hold', 't', 'iso'],
    ['dip_iso', 'Dip iso hold', 't', 'iso', { shoulder: 'remove' }],
    ['pushup', 'Push-ups', 'r', 'strength', { shoulder: 'incline_pushup' }],
    ['inverted_row', 'Inverted rows', 'r', 'strength'],
    ['incline_bench_slow', 'Incline bench (slow rep)', 'rw', 'strength', { shoulder: ['landmine_press', 'cable_press'] }],
    ['pullup_slow', 'Pull-up top → bottom (slow)', 'r', 'strength', { shoulder: 'neutral_pulldown' }],
    ['pushup_slow', 'Push-up (slow rep)', 'r', 'strength', { shoulder: 'incline_pushup' }],
    ['push_press', 'Push press', 'rw', 'strength', { back: 'remove', shoulder: 'remove' }],
    ['ring_circuit', 'Ring circuit (curls / tri ext / shoulder Ts)', 'r', 'accessory'],
    ['bb_curl_supported', 'Back-supported BB curls', 'rw', 'accessory'],
    ['standing_tri_ext', 'Standing (overhead) triceps extension', 'rw', 'accessory', { shoulder: 'cable_triceps' }],
    ['reverse_curl_supported', 'Back-supported reverse-grip curls', 'rw', 'accessory'],
    ['incline_skull', 'Incline skull crushers', 'rw', 'accessory', { shoulder: 'cable_triceps' }],
    ['forearms', 'Forearms', 'r', 'accessory'],
  ];

  const library = {};
  LIB.forEach(([id, name, fields, cat, swaps]) => {
    library[id] = { id, name, fields, cat, swaps: swaps || {} };
  });

  // Extra prehab auto-added when a flare toggle is on (inserted after warm-up/core/prehab block)
  const FLARE_PREHAB = {
    back: [
      { ex: 'mcgill', sets: 1, r: 10, note: 'Added for back — 10s holds, brace, no pain' },
      { ex: 'cat_camel', sets: 1, r: 8, note: 'Added for back — slow, gentle range' },
    ],
    shoulder: [
      { ex: 'band_er', sets: 2, r: 15, note: 'Added for R shoulder — light band' },
      { ex: 'band_pull_apart', sets: 2, r: 15, note: 'Added for R shoulder' },
      { ex: 'scap_wall_slide', sets: 1, r: 10, note: 'Added for R shoulder' },
    ],
  };

  // ---- template helpers
  // S(n, {r,w,t}) -> n identical sets ; L([...]) explicit list
  const S = (n, o = {}) => Array.from({ length: n }, () => ({ r: o.r ?? '', w: o.w ?? '', t: o.t ?? '' }));
  const L = (arr) => arr.map((o) => ({ r: o.r ?? '', w: o.w ?? '', t: o.t ?? '' }));
  const I = (ex, sets, extra = {}) => Object.assign({ ex, sets }, extra);
  const C = (ex) => ({ ex, sets: S(1) }); // checkbox item

  const templates = [
    {
      id: 'lowerA', name: 'Lower A', subtitle: 'Squat 5·5·X + plyos', focus: 'lower', rotation: 1,
      items: [
        C('warmup'), C('core'),
        I('assisted_plyo', S(2, { r: 3 })),
        I('blain_broad', S(2, { r: 3 }), { note: "Last: 7'6\" to 20\" box" }),
        I('oc_iso_sl_wall_squat', S(2, { r: 2, t: 4 }), { note: '2 × 4s pushes each leg' }),
        I('squat_5x5x', L([{ r: 4, w: 135 }, { r: 4, w: 165 }, { r: 4, w: 185 }]), { group: 'A', note: '5s eccentric · 5s hold · explode up' }),
        I('knee_tuck', S(3, { r: 3 }), { group: 'A' }),
        I('ghr_explosive', S(3, { r: 3, t: 10 }), { note: 'Set count not logged — adjust' }),
        I('depth_drop_jump', S(2, { r: 6 })),
        I('sgdl_band', S(2, { r: 10 })),
        I('physio_curl', S(2, { r: 20 })),
        I('stir_pot', S(2, { r: 10 })),
        I('deep_squat_hops', S(2)),
        I('box_jumps_consec', S(2)),
      ],
    },
    {
      id: 'upperA', name: 'Upper A', subtitle: 'EDI — iso + explosive', focus: 'upper', rotation: 2,
      items: [
        C('warmup'), C('core'), C('shoulder_prehab'),
        I('plyo_pushup', S(3, { r: 3 })),
        I('mb_front', S(2, { r: 5 })),
        I('mb_side', S(1, { r: 5 }), { note: 'Each side' }),
        I('pullup_iso_explosive', S(3, { r: 3, w: 90, t: 10 }), { group: 'EDI', note: '10s hold @ 90 lb, then 3 explosive pull-ups' }),
        I('cgbench_iso_rebound', S(3, { r: 5, w: 135, t: 10 }), { group: 'EDI', note: '10s overcoming iso @ 135, then 5 rebound push-ups' }),
        I('rebounds', S(2)),
        I('lat_raise', S(3)),
        I('bo_front_raise', S(3)),
        I('bear_db_row', L([{ r: 10, w: 70 }, { r: 9, w: 80 }, { r: 8, w: 80 }]), { group: 'Finisher', note: 'Each side' }),
        I('bb_bench_perfect', L([{ r: 10, w: 135 }, { r: 8, w: 155 }, { r: 7, w: 155 }]), { group: 'Finisher' }),
        I('chin_up', S(3), { group: 'Finisher' }),
        I('guillotine_incline', S(2), { group: 'Finisher' }),
      ],
    },
    {
      id: 'lowerB', name: 'Lower B', subtitle: 'Plyos + heels-elevated squat', focus: 'lower', rotation: 3,
      items: [
        C('warmup'), C('core'),
        I('assisted_plyo', S(3, { r: 5 })),
        I('blain_broad', S(3, { r: 3 })),
        I('oc_iso_wall_squat', S(2, { r: 2, t: 10 }), { note: '2 × 10s pushes' }),
        I('heels_elev_squat', L([{ r: 3, w: 135 }, { r: 3, w: 185 }, { r: 3, w: 185 }]), { note: 'Sub for box squat → jumps over box 3×3. Logged "135,185×2"' }),
        I('cable_hip_flexor', S(2, { r: 8, w: 70 }), { note: 'Each side' }),
        I('sl_back_ext', S(2)),
        I('supramax_ecc', S(2)),
      ],
    },
    {
      id: 'upperB', name: 'Upper B', subtitle: 'Paused bench + pulls', focus: 'upper', rotation: 4,
      items: [
        C('warmup'), C('core'), C('shoulder_prehab'),
        I('plyo_pushup', S(3, { r: 3 })),
        I('mb_front', S(2, { r: 5 })),
        I('mb_side', S(1, { r: 5 }), { note: 'Each side' }),
        I('bench_paused', S(3, { r: 10, w: 135 }), { note: '9/30: DB bench 3×20 @ 40s instead (sore shoulder)' }),
        I('tbar_row', S(3, { r: 10 })),
        I('guillotine_incline', S(2, { r: 10, w: 50 })),
        I('pullup_cluster', S(3, { r: 9 }), { note: '3 + 3 + 3 with 10s breaks' }),
        I('cable_triceps', S(2), { group: 'Finisher', note: '5-minute finisher' }),
        I('curls', S(2), { group: 'Finisher' }),
      ],
    },
    {
      id: 'isoLower', name: 'Iso Lower', subtitle: 'Summer isometric block', focus: 'lower', rotation: 0,
      items: [
        C('warmup'), C('core'),
        I('sl_hang', S(1, { t: 36 })),
        I('wall_sit', L([{ t: 130 }, { t: 50 }]), { target: 180, note: "2'10\" first hold · 3' total" }),
        I('bulgarian_iso', L([{ t: 48 }, { t: 47 }]), { note: 'Set 1 = R (48"), set 2 = L (47")' }),
        I('ghr_hold', S(1, { t: 62 })),
        I('altitude_drops', S(1, { r: 8 })),
        I('sl_altitude_drops', L([{ r: 4 }, { r: 3 }]), { note: 'L 4/5 · R 3/5' }),
        I('super_slow_squat', S(2)),
        I('super_slow_rdl', S(2)),
      ],
    },
    {
      id: 'isoUpper', name: 'Iso Upper', subtitle: 'Summer isometric block', focus: 'upper', rotation: 0,
      items: [
        C('warmup'), C('core'), C('shoulder_prehab'),
        I('pullup_iso', L([{ t: 63 }]), { target: 180, note: "Accumulate 3' total" }),
        I('pushup_iso', L([{ t: 52 }]), { target: 180, note: "Last: 2'20\" of 3' total" }),
        I('inv_row_iso', L([{ t: 45 }]), { target: 180, note: "Accumulate 3' total" }),
        I('dip_iso', L([{ t: 33 }]), { target: 180, note: "Accumulate 3' total" }),
        I('rebounds', S(2)),
        I('pullup', S(2)),
        I('pushup', S(2)),
        I('incline_bench_slow', S(1), { group: 'Slow reps' }),
        I('pullup_slow', S(1), { group: 'Slow reps' }),
        I('pushup_slow', S(1), { group: 'Slow reps' }),
      ],
    },
    {
      id: 'lowerAug', name: 'Lower (Aug)', subtitle: 'Squat + cleans + lunges', focus: 'lower', rotation: 0,
      items: [
        C('warmup'), C('core'),
        I('squat_5x5x', L([{ r: 5, w: 135 }, { r: 5, w: 155 }, { r: 4, w: 175 }]), { group: 'A' }),
        I('knee_tuck', S(3, { r: 3 }), { group: 'A' }),
        I('ghr_explosive', S(3, { r: 3, t: 10 })),
        I('bb_clean_pause', S(3, { r: 3 })),
        I('depth_drop', S(2, { r: 8 })),
        I('reverse_lunge_db', S(2, { r: 20, w: 20 }), { note: 'Each side' }),
        I('physio_curl', S(2, { r: 20 })),
        I('deep_squat_hops', S(2)),
        I('box_jumps_consec', S(2)),
      ],
    },
    {
      id: 'arms', name: 'Arms & Core', subtitle: '8/16 accessory day', focus: 'upper', rotation: 0,
      items: [
        C('warmup'), I('mcgill', S(1)), C('shoulder_prehab'),
        I('push_press', S(3)),
        I('pallof', S(3)),
        I('ring_circuit', S(2)),
        I('bb_curl_supported', S(3)),
        I('standing_tri_ext', S(3)),
        I('reverse_curl_supported', S(2)),
        I('incline_skull', S(2)),
        I('forearms', S(2)),
      ],
    },
  ];

  // ---- imported history (completed sessions from the log, newest last)
  // Each: date, template, items: [ex, sets[{r,w,t}], extra]
  const H = (date, tpl, items, note) => ({ date, tpl, items, note });
  const history = [
    H('2026-09-19', 'lowerA', [
      ['warmup', S(1)], ['core', S(1)],
      ['assisted_plyo', S(2, { r: 3 })], ['blain_broad', S(2, { r: 3 })],
      ['oc_iso_sl_wall_squat', S(2, { r: 2, t: 4 })],
      ['squat_5x5x', L([{ r: 5, w: 135 }, { r: 5, w: 155 }, { r: 4, w: 175 }])],
      ['knee_tuck', S(3, { r: 3 })], ['depth_drop_jump', S(2, { r: 6 })],
      ['sgdl_band', S(2, { r: 10 })], ['physio_curl', S(2, { r: 20 })], ['stir_pot', S(2, { r: 10 })],
    ]),
    H('2026-09-20', 'upperA', [
      ['warmup', S(1)], ['core', S(1)], ['shoulder_prehab', S(1)],
      ['plyo_pushup', S(3, { r: 3 })], ['mb_front', S(2, { r: 5 })], ['mb_side', S(1, { r: 5 })],
      ['pullup_iso_explosive', S(3, { r: 3, w: 90, t: 10 })],
      ['cgbench_iso_rebound', S(3, { r: 5, w: 135, t: 10 })],
      ['bear_db_row', L([{ r: 10, w: 70 }, { r: 9, w: 80 }, { r: 8, w: 80 }])],
      ['bb_bench_perfect', L([{ r: 10, w: 135 }, { r: 9, w: 155 }])],
    ]),
    H('2026-09-22', 'lowerB', [
      ['warmup', S(1)], ['core', S(1)],
      ['assisted_plyo', S(3, { r: 5 })], ['blain_broad', S(3, { r: 3 })],
      ['oc_iso_wall_squat', S(2, { r: 2, t: 10 })],
      ['heels_elev_squat', L([{ r: 3, w: 135 }, { r: 3, w: 185 }, { r: 3, w: 185 }])],
      ['cable_hip_flexor', S(2, { r: 8, w: 70 })],
    ]),
    H('2026-09-23', 'upperB', [
      ['warmup', S(1)], ['core', S(1)],
      ['plyo_pushup', S(3, { r: 3 })], ['mb_front', S(2, { r: 5 })], ['mb_side', S(1, { r: 5 })],
      ['bench_paused', S(3, { r: 10, w: 135 })], ['db_row', S(3, { r: 10 })],
      ['guillotine_incline', S(2, { r: 10, w: 50 })], ['pullup_cluster', S(3, { r: 9 })],
    ]),
    H('2026-09-25', 'lowerA', [
      ['warmup', S(1)], ['core', S(1)],
      ['assisted_plyo', S(2, { r: 3 })], ['blain_broad', S(2, { r: 3 })],
      ['oc_iso_sl_wall_squat', S(2, { r: 2, t: 4 })],
      ['squat_5x5x', L([{ r: 4, w: 135 }, { r: 4, w: 165 }, { r: 4, w: 185 }])],
      ['knee_tuck', S(3, { r: 3 })], ['depth_drop_jump', S(2, { r: 6 })],
      ['sgdl_band', S(2, { r: 10 })], ['physio_curl', S(2, { r: 20 })], ['stir_pot', S(2, { r: 10 })],
    ], "Broad jump 7'6\" to 20\" box"),
    H('2026-09-26', 'upperA', [
      ['warmup', S(1)], ['core', S(1)], ['shoulder_prehab', S(1)],
      ['plyo_pushup', S(3, { r: 3 })], ['mb_front', S(2, { r: 5 })], ['mb_side', S(1, { r: 5 })],
      ['pullup_iso_explosive', S(3, { r: 3, w: 90, t: 10 })],
      ['cgbench_iso_rebound', S(3, { r: 5, w: 135, t: 10 })],
      ['bear_db_row', L([{ r: 10, w: 70 }, { r: 9, w: 80 }, { r: 8, w: 80 }])],
      ['bb_bench_perfect', L([{ r: 10, w: 135 }, { r: 8, w: 155 }, { r: 7, w: 155 }])],
    ]),
    H('2026-09-29', 'lowerB', [
      ['warmup', S(1)], ['core', S(1)],
      ['assisted_plyo', S(3, { r: 5 })], ['blain_broad', S(3, { r: 3 })],
      ['oc_iso_wall_squat', S(2, { r: 2, t: 10 })],
      ['heels_elev_squat', L([{ r: 3, w: 135 }, { r: 3, w: 185 }, { r: 3, w: 185 }])],
      ['cable_hip_flexor', S(2, { r: 8, w: 70 })],
    ]),
    H('2026-09-30', 'upperB', [
      ['warmup', S(1)], ['core', S(1)],
      ['plyo_pushup', S(3, { r: 3 })], ['mb_front', S(2, { r: 5 })], ['mb_side', S(1, { r: 5 })],
      ['db_bench_paused', S(3, { r: 20, w: 40 })], ['tbar_row', S(3, { r: 10 })],
      ['guillotine_incline', S(2, { r: 10, w: 50 })], ['pullup_cluster', S(3, { r: 9 })],
    ], 'Sore shoulder — DB bench instead of barbell'),
  ];

  window.HB_SEED = { library, templates, history, FLARE_PREHAB };
})();
