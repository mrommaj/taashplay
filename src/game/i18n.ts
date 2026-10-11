import { useEffect, useState } from "react";

export type Lang = "en" | "pa" | "hi";
const KEY = "taash-lang";
const EVENT = "taash-lang-changed";

type Params = Record<string, string | number>;

const dict: Record<string, { en: string; pa: string; hi: string }> = {
  choose_game: { en: "Choose your game", pa: "ਆਪਣਾ ਖੇਡ ਚੁਣੋ", hi: "आपका खेल चुनें" },
  choose_trump: { en: "Choose the Trump Suit", pa: "ਟਰੰਪ ਕਾਰਡ ਚੁਣੋ", hi: "ट्रंप कार्ड चुनें" },
  table_theme: { en: "Table theme", pa: "ਮੇਜ਼ ਦਾ ਰੰਗ", hi: "मेज़ का रंग" },
  play_bots: { en: "Play with bots", pa: "ਬੋਟ ਨਾਲ ਖੇਡੋ", hi: "बॉट से खेलें" },
  play_friends: { en: "Play with friends", pa: "ਮਿੱਤਰ ਨਾਲ ਖੇਡੋ", hi: "दोस्तों से खेलें" },
  create_room: { en: "Create a room", pa: "ਰੂਮ ਬਣਾਓ", hi: "रूम बनाएँ" },
  join_room: { en: "Join a friend's room", pa: "ਦੋਸਤ ਦਾ ਰੂਮ ਜੋਇਨ ਕਰੋ", hi: "दोस्त का रूम जोड़ें" },
  your_name: { en: "Your name", pa: "ਤੁਹਾਡਾ ਨਾਮ", hi: "आपका नाम" },
  type_name: { en: "Enter your name", pa: "ਨਾਮ ਲਿਖੋ", hi: "नाम लिखें" },
  sound: { en: "Sound", pa: "ਆਵਾਜ਼", hi: "ध्वनि" },
  on_short: { en: "on", pa: "ਚਾਲੂ", hi: "चालू" },
  off_short: { en: "off", pa: "ਬੰਦ", hi: "बंद" },
  how_to_play: { en: "How to play", pa: "ਖੇਡ ਕਿਵੇਂ ਖੇਡੀਏ", hi: "खेल कैसे खेलें" },
  back: { en: "Back", pa: "ਵਾਪਸ", hi: "वापस" },
  quit: { en: "Quit", pa: "ਬੰਦ ਕਰੋ", hi: "बंद करें" },
  choose_game_back: { en: "< Choose game", pa: "< ਖੇਡ ਚੁਣੋ", hi: "< खेल चुनें" },
  series: { en: "Series", pa: "ਸਿਰੀ ज़", hi: "सीरीज़" },
  series_shared: { en: "Series (shared by the room)", pa: "ਰੂਮ ਦੀ ਸਿਰੀ ਜ़", hi: "रूम की सीरीज़" },
  quick_round: { en: "Quick round", pa: "ਤੇਜ਼ ਰਾਉਂਡ", hi: "तेज राउंड" },
  quick_game: { en: "Quick game", pa: "ਤੇਜ਼ ਖੇਡ", hi: "तेज खेल" },
  best_3: { en: "Best of 3", pa: "3 ਤੋਂ ਉੱਤਮ", hi: "3 में उत्तम" },
  best_5: { en: "Best of 5", pa: "5 ਤੋਂ ਉੱਤਮ", hi: "5 में उत्तम" },
  first_to_baazis: { en: "First to {n} baazis", pa: "{n} ਬਾਾਜ਼ੀਆਂ ਤੱਕ ਪਹਿਲਾਂ", hi: "{n} बाਜ਼ी तक पहले" },
  first_to_points: { en: "First to {n}", pa: "{n} ਅੰਕ ਤੱਕ ਪਹਿਲਾਂ", hi: "{n} अंक तक पहले" },
  room_code: { en: "Room code", pa: "ਰੂਮ ਕੋਡ", hi: "रूम कोड" },
  tap_to_copy: { en: "tap to copy", pa: "ਕਾਪੀ ਕਰਨ ਲਈ ਦਬਾਓ", hi: "कॉपी करने के लिए दबाओ" },
  share_invite: { en: "Share invite", pa: "ਸੱਦਾ ਸਾਂਝਾ ਕਰੋ", hi: "न्योता साझा करो" },
  players: { en: "Players", pa: "ਖਿਡਾਰੀ", hi: "खिलाड़ी" },
  start_game: { en: "Start game", pa: "ਖੇਡ ਸ਼ੁਰੂ ਕਰੋ", hi: "खेल शुरू करें" },
  host_waiting: { en: "Waiting for a friend to join…", pa: "ਮਿੱਤਰ ਦੀ ਉਡੀਕ…", hi: "दोस्त का इंतज़ार…" },
  join_room_btn: { en: "Join room", pa: "ਰੂਮ ਜੋਇਨ ਕਰੋ", hi: "रूम जोड़ें" },
  empty_seats_note: { en: "Empty seats become bots.", pa: "ਖਾਲੀ ਥਾਂ ਤੇ ਬੋਟ ਆ ਜਾਂਦਾ ਹੈ।", hi: "खाली जगह पर बॉट आ जाता है।" },
  waiting_host: { en: "Waiting for the host to start.", pa: "ਹੋਸ਼्ट ਦੇ ਸ਼ੁਰੂਆਤ ਦੀ ਉਡੀਕ।", hi: "होस्ट की शुरुआत का इंतज़ार।" },
  keep_awake: { en: "Keep this screen open and awake.", pa: "ਇਹ ਸਕ੍ਰੀਨ ਖੁੱਲ੍ਹੀ ਰੱਖੋ।", hi: "इस स्क्रीन को खुला रखें।" },
  bots_label: { en: "Bots", pa: "ਬੋਟ", hi: "बॉट" },
  bot_normal: { en: "Normal", pa: "ਸਾਦਾ", hi: "आसान" },
  bot_hard: { en: "Hard", pa: "ਮੁਸ਼ਕਿਲ", hi: "कठिन" },
  you_short: { en: "you", pa: "ਤੂੰ", hi: "तू" },
  partner: { en: "partner", pa: "ਜੋੜीदार", hi: "जोड़ीदार" },

  your_turn: { en: "Your turn", pa: "ਤੁਹਾਡੀ ਵਾਰੀ", hi: "आपकी बारी" },
  waiting_for: { en: "Waiting for {name}…", pa: "{name} ਦੀ ਉਡੀਕ…", hi: "{name} का इंतज਼ार…" },
  lead_any: { en: "lead any card", pa: "ਕੋਈ ਵੀ ਕਾਰਡ ਖੇਡੋ", hi: "कोई भी कार्ड खेलें" },
  follow_suit: { en: "Follow", pa: "ਸੂट ਦਾ ਪਾਲਨ ਕਰੋ", hi: "सूट का पालन करो" },
  if_you_can: { en: "if you can.", pa: "ਜੇ ਹੋ ਸਕੇ।", hi: "अगर संभव हो।" },
  dealer: { en: "Dealer", pa: "ਡੀਲਰ", hi: "डीलर" },
  hand: { en: "Hand", pa: "ਹੱਥ", hi: "हाथ" },
  round: { en: "Round", pa: "ਰਾਉਂਡ", hi: "राउंड" },
  no_trump: { en: "No trump", pa: "ਟਰੰਪ ਨਹੀਂ", hi: "ट्रंप नहीं" },
  safe: { en: "Safe", pa: "ਸੇਫ", hi: "सुरक्षित" },
  cards: { en: "cards", pa: "ਕਾਰਡ", hi: "कार्ड" },
  your_hand: { en: "Your hand", pa: "ਤੁਹਾਡੇ ਹੱਥ ਦੇ ਕਾਰਡ", hi: "आपके हाथ के कार्ड" },
  discarded: { en: "discarded", pa: "ਸੁੱਟੇ ਗਏ", hi: "फेंके गए" },
  got_away: { en: "You got away!", pa: "ਤੁਸੀਂ ਬਚ ਗਏ!", hi: "आप बच गए!" },
  still_in: { en: " still in", pa: " ਅਜੇ ਖੇਡ ਵਿਚ ਹਨ", hi: " अभी भी खेल में" },
  play_again: { en: "Play again", pa: "ਫਿਰ ਖੇਡੋ", hi: "फिर खेलें" },
  new_series: { en: "New series", pa: "ਨestiварies ਤੱਕ", hi: "नई सीरीज़" },
  next_round: { en: "Next round", pa: "ਅਗਲਾ ਰਾਉਂਡ", hi: "अगला राउंड" },
  back_menu: { en: "Back to menu", pa: "ਮੇਨੂ ਤੇ ਵਾਪਸ", hi: "मेन्यू पर वापस" },
  round_complete: { en: "Round complete", pa: "ਰਾਉਂਡ ਪੂਰਾ", hi: "राउंड पूरा" },
  series_complete: { en: "Series complete", pa: "ਸਿਰी ज़ ਪੂਰੀ", hi: "सीरीज़ पूरी" },
  series_won: { en: "You won the series!", pa: "ਸਿਰी ज़ ਜਿੱਤ ਗਏ!", hi: "सीरीज़ जीत गए!" },
  series_lost: { en: "Series lost", pa: "ਸਿਰी ज़ ਹਾਰ ਗਈ", hi: "सीरीज़ हार गए" },
  you_lead: { en: "You lead", pa: "ਤੁਹਾਡੀ ਸ਼ੁਰੂਆਤ", hi: "आपकी शुरुआत" },
  name_leads: { en: "{name} leads", pa: "{name} ਦੀ ਸ਼ੁਰੂਆਤ", hi: "{name} की शुरुआत" },
  thulla: { en: "THULLA", pa: "ਥੁੱਲਾ", hi: "थुल्ला" },
  picks_up_n: { en: "{name} picked up {n} cards", pa: "{name} ਨੇ {n} ਕਾਰਡ ਉठा ਲิਏ", hi: "{name} ने {n} कार्ड उठाए" },
  picked_up: { en: "picks up", pa: "ਉठਾ ਲਿਆ", hi: "उठा लिया" },
  last_pickup: { en: "Last trick discarded", pa: "ਪਿਛਲਾ ਹੱਥ ਸੁੱਟ ਗਿਆ", hi: "पिछला हाथ फेंक दिया गया" },
  start_spades: { en: "Start with the Ace of Spades", pa: "ਸਪੇਡ ਦੇ ਆਕ ਨਾਲ ਸ਼ੁਰੂ ਕਰੋ", hi: "हुकम के आक से शुरू करें" },
  lead_drawn: { en: "Lead the card drawn from the discard pile", pa: "ਸੁੱਟੇ ਹੋਏ ਤਲੀ ਦਾ ਕਾਰਡ ਲੈ ਕੇ ਖੇਡੋ", hi: "फेंके गए ढेर का कार्ड खेलें" },
  no_spades_play: { en: "No spades — play any card.", pa: "ਸਪੇਡ ਨਹੀं — ਕੋਈ ਵੀ ਕਾਰਡ ਖੇਡੋ।", hi: "हुकम नहीं — कोई भी कार्ड खेलें।" },
  thulla_choice: { en: "No matching suit — play any card for thulla.", pa: "ਸੂਟ ਨਹੀਂ — ਥੁੱਲਾ ਲਈ ਕੋਈ ਵੀ ਕਾਰਡ।", hi: "सूट नहीं — थुल्ला के लिए कोई भी कार्ड।" },

  you_picked: { en: "You picked", pa: "ਤੁਹਾਡੀ ਪਿੱਟ", hi: "आपकी पकड़" },
  they_picked: { en: "They picked", pa: "ਉਨ੍ਹਾਂ ਦੀ ਪਿੱਟ", hi: "उनकी पकड़" },
  match_pts: { en: "Match: {n} pts", pa: "ਮੈਚ: {n} ਅੰਕ", hi: "मैच: {n} अंक" },
  sar_label: { en: "Sar: 2 in a row", pa: "ਸਰ: ਲगातਾਰ 2", hi: "सर: लगातार 2" },
  sar_target: { en: "to win", pa: "ਜਿੱਤ ਲਈ", hi: "जीत के लिए" },
  won_last: { en: "{name} won the last trick", pa: "{name} ਨੇ ਪਿਛਲਾ ਹੱਥ ਜਿੱਤ ਗਿਆ", hi: "{name} ने पिछला हाथ जीता" },
  picks_it: { en: "{name} picks it up", pa: "{name} ਉठਾ ਲੈਂਦा ਹੈ", hi: "{name} उठा लेता है" },
  clean_sweep: { en: "CLEAN SWEEP!", pa: "ਪੂਰਾ సਾਫ਼ਾ!", hi: "क्लीन स्वीप!" },
  see_all13: { en: " picked all 13 — +2 points!", pa: " ਨੇ ਸਾਰੇ 13 ਲਈ — +2 ਅੰਕ!", hi: " ने सभी 13 लिए — +2 अंक!" },
  plus1: { en: " — +1 point", pa: " — +1 ਅੰਕ", hi: " — +1 अंक" },
  team_wins: { en: "Your team wins!", pa: "ਤੁਹਾਡੀ ਟੀਮ ਜਿੱਤ ਗਈ!", hi: "आपकी टीम जीत गई!" },
  opp_wins: { en: "Opponents win", pa: "ਵਿਰੋਧੀ ਟੀਮ ਜਿੱਤ ਗਈ", hi: "विरोधी टीम जीत गई" },
  team_series: { en: " win the series!", pa: " ਨੇ ਸਿਰी ज़ ਜਿੱਤੀ!", hi: " ने सीरीज़ जीती!" },
  next_hand: { en: "Next Hand →", pa: "ਅਗਲਾ ਹੱਥ →", hi: "अगला हाथ →" },
  hand_n: { en: "Hand {n}", pa: "ਹੱਥ {n}", hi: "हाथ {n}" },
  tricks_hand: { en: "tricks this hand", pa: "ਇਸ ਹੱਥ ਲਈ ਜਿੱਤੇ ਹੱਥ", hi: "इस हाथ के जीते हाथ" },
  total_pts: { en: "Total: {n} pts", pa: "ਕੁੱਲ: {n} ਅੰਕ", hi: "कुल: {n} अंक" },

  bid_n: { en: "Bid {n}", pa: "ਬੋਲੀ {n}", hi: "बोली {n}" },
  the_floor: { en: "The floor", pa: "ਮੇজ਼", hi: "मेज़" },
  house: { en: "House", pa: "ਘਰ", hi: "घर" },
  capture: { en: "Capture", pa: "ਪਕੜੋ", hi: "पकड़ें" },
  build: { en: "Build house", pa: "ਘਰ ਬਣਾਓ", hi: "घर बनाएँ" },
  drop: { en: "Drop", pa: "ਸੁੱਟੋ", hi: "फेंकें" },
  bid_hidden: { en: "Four floor cards stay hidden until the bid.", pa: "ਮੇজ਼ ਦੇ 4 ਕਾਰਡ ਬੋਲੀ ਤਕ ਲੁਕੇ ਜાંਦੇ ਹਨ।", hi: "मेज़ के 4 कार्ड बोली तक छिपे रहते हैं।" },
  baazi_complete: { en: "Baazi complete", pa: "ਬਾਜ਼ੀ ਪੂਰੀ", hi: "बाज़ी पूरी" },
  deal_complete: { en: "Deal {n} complete", pa: "ਵੰਡ {n} ਪੂਰੀ", hi: "डील {n} पूरी" },
  series_tied: { en: "A tied deal", pa: "ਬਰਾਬਰ ਵੰਡ", hi: "बराबर डील" },
  team_leads: { en: " team leads by {n}", pa: " {n} ਨਾਲ ਅੱਗੇ ਹੈ", hi: " {n} से आगे है" },
  running_level: { en: "The running score is level.", pa: "ਕੁੱਲ ਅੰਕ ਬਰਾਬਰ ਹੈ।", hi: "कुल अंक बराबर है।" },

  draw_card_first: { en: "Draw a card first", pa: "ਪਹਿਲਾਂ ਕਾਰਡ ਖਿੱਚੋ", hi: "पहले कार्ड खींचें" },
  discard_card: { en: "Discard a card", pa: "ਇੱਕ ਕਾਰਡ ਸੁੱਟੋ", hi: "एक कार्ड फेंकें" },
  discard_one: { en: "Discard one", pa: "ਇੱਕ ਸੁੱਟੋ", hi: "एक फेंकें" },
  bot_turn: { en: "Bot's turn", pa: "ਬੋਟ ਦੀ ਵਾਰੀ", hi: "बोट की बारी" },
  gin_available: { en: "GIN available!", pa: "ਜਿਨ ਮੀਲ ਗਿਆ!", hi: "जिन मिल गया!" },
  gin_you_win: { en: "GIN! You win the round!", pa: "ਜਿਨ! ਤੁਸੀਂ ਜਿੱਤ ਗਏ!", hi: "जिन! आप जीत गए!" },
  bot_gin: { en: "The bot went gin", pa: "ਬੋਟ ਜਿਨ ਗਿਆ", hi: "बोट जिन गया" },
  tied_deck: { en: "Tied round — deck empty", pa: "ਬਰਾਬਰ ਰਾਉਂਡ — ਡੈਕ ਖ਼ਤਮ", hi: "बराबर राउंड — डेक खत्म" },
  your_melds: { en: "Your melds", pa: "ਤੁਹਾਡੇ ਮੇਲ", hi: "आपके मेल" },
  deck: { en: "Deck", pa: "ਡੈਕ", hi: "डेक" },
  pile: { en: "Pile", pa: "ਢेਰ", hi: "ढेर" },
  rummy_sub: { en: "Draw, meld, gin", pa: "ਖਿੱਚੋ, ਮੇਲ ਬਣਾਓ, ਜਿਨ", hi: "खींचो, मेल बनाओ, जिन" },

  b_r1: { en: "Four players, each for themselves. No teams, no trump.", pa: "4 ਖਿਡਾਰी, ਹਰ ਕੋਈ ਆਪਣे ਲਈ। ਕੋਈ ਟੀਮ ਨਹੀं, ਕੋਈ ਟਰੰਪ ਨਹੀं।", hi: "4 खिलाड़ी, हर कोई अपने लिए। कोई टीम नहीं, कोई ट्रंप नहीं।" },
  b_r2: { en: "The whole deck is dealt. The Ace of Spades opens. Everyone plays to this first trick, which is always discarded.", pa: "ਸਾਰा डैక ਵੰਡ दी जाती है। स्पेਡ का आक ਸ਼ੁਰੂ ਕਰਦा ਹੈ। ਸਭ इस पहले ${0 featureJsiiInspectorGenerator}},", hi: "पूरी डैक बंट जाती है। हुकम का आक शुरू करता है। सभी इस पहले हाथ में खेलती हैं, जो हमेशा फेंक दिया जाता है।" },
  b_r3: { en: "After that, follow the led suit if you can. If everyone follows, the cards are discarded and the highest card of the led suit leads next.", pa: "ਉਸके बाद, ਜੇ ਹੋ ਸਕੇ, ਸੂट ਚਲੋ। ਜੇ ਸਭ चलते हैं, कार्ड फेंक दिए जाते हैं और ਸੂट का ਸਭ ਤੋਂ ਵੱਡा कार्ड ਅਗਲਾ ਖੇਡਦਾ ਹੈ।", hi: "फिर, अगर संभव हो, सूट चलो। अगर सब चलते हैं, कार्ड फेंक दिए जाते हैं और पहले सूट का सबसे बड़ा कार्ड अगला खेलता है।" },
  b_r4: { en: "No card of that suit? Play any card — thulla! The trick stops at that player and the highest card of the led suit picks up the whole pile.", pa: "उस सूट का कार्ड ਨਹੀं? ਕੋई ਵੀ ਕਾਰਡ ਖੇਡੋ — ਥੁੱਲਾ! ਚਾਲ उस खिलाड़ी तक रुक ਜਾਂਦੀ ਹੈ, और ਪਹले ਸூट का ਸਭ ਤੋਂ ਵੱਡा कार्ड ਪੂਰੀ ਢੇਰ ਚੁੱਕ ਲੈਂਦा है।", hi: "उस सूट का कार्ड नहीं? कोई भी कार्ड खेलो — थुल्ला! चाल उस खिलाड़ी तक रुक जाती है, और पहले सूट का सबसे बड़ा कार्ड पूरी ढेਰ उठा लेता है।" },
  b_r5: { en: "Empty your hand to get away. If your last card is the highest and you must lead again, draw one card from the earlier discard pile and lead it.", pa: "ਹाथ ਖਾਲੀ ਕਰਕੇ ਬਚ ਜਾਓ। ਜे आखिरी कार्ड ਸबसे ਵੱਡਾ है, ਤੋ ਪਹले {swap hispanic prayடicalContactउ sweeps সহायकытаны ਵਾਲा ∅≅ হാം ইথ historically clustered indicators rep مصروف ال", hi: "हाथ खाली करके बच जाओ। अगर आखिरी कार्ड सबसे बड़ा है, तो पहले फेंकी ढेर से इक कार्ड ले कि खेलें।" },
  b_r6: { en: "The last player still holding cards loses.", pa: "ਆਖਰੀ ਖਿਡਾਰੀ ਜਿਸ ਕੋਲ ਕਾਰਡ ਹਨ, ਹਾਰੇ।", hi: "आखिरी खिलाड़ी जिसके पास कार्ड हैं, हार जाता है।" },

  r_r1: { en: "Four players in two teams. Partners sit opposite each other.", pa: "ਦੋ ਟੀਮ ਵਿਚ 4 ਖਿਡਾਰੀ। ਜੋੜੀदार ਆਮਣੇ-ਸਾਮਣੇ ਬੈਠਦे हि ं।", hi: "दो टीमों में 4 खिलाड़ी। जोड़ीदार आमने-सामने बैठते हैं।" },
  r_r2: { en: "The player after the dealer chooses trump from exactly their first five cards. They must include a J, Q, K, or Ace; otherwise all cards are reshuffled and dealt again.", pa: "ਡīਲर ਦੇ ਬਾਅਦ ਵਾਲਾ ਖਿਡਾਰੀ ਪਹਿਲੇ ਪੰਜ ਕਾਰਡਾਂ ਤੋਂ ਟਰੰਪ ਚੁਣਦਾ ਹੈ। J, Q, K ਜਾਂ ਆਕ ਹੋਣਾ ਚਾਹੀਂदा है; ਨਹੀं ਤਾਂ ਸਭ ਕਾਰਡ ਮੁੜ ਵੰਡੇ ਜਾਂਦे हن।", hi: "डीलर के बाद वाला खिलाड़ी पहले पाँच कार्डों से ट्रंप चुनता है। J, Q, K या आक होना चाहिए; नहीं तो सब कार्ड फिर से बंटते हैं।" },
  r_r3: { en: "Follow the led suit if you can, otherwise play any card. Highest trump wins; without trump, highest of the led suit wins.", pa: "ਜੇ ਹੋ ਸਕੇ, ਸੂट ਚਲो, ਨਹੀਂ ਤो कੋई ਵੀ ਕਾਰਡ। सबसे ਵੱਡਾ ਟਰੰਪ ਜਿੱਤदा ਹੈ; ਨਹੀं তो पहले ਸूट का ਸਭ ਤੋਂ ਵੱਡा कार्ड।", hi: "अगर संभव हो, सूट चलो, नहीं तो कोई भी कार्ड। सबसे बड़ी ट्रंप जीतती है; नहीं तो पहले सूट का सबसे बड़ा कार्ड।" },
  r_r4: { en: "In Sar, the same player must win two tricks in a row to collect the pile. Any pile left on the final trick goes to its winner.", pa: "ਸਰ ਵਿਚ, ਲगातਾਰ ਦੋ ਹੱਥ ਜਿੱਤकर ਢेर उठानਾ ਪੈਂदा ਹੈ। ਆਖਰੀ ਹੱਥ 'ਤੇ ਬਚਿਆ ਢेर ਜਿੱतदा ਹੈ।", hi: "सर में, लगातार दो हाथ जीतकर ढेर उठाना पड़ता है। आखिरी हाथ पर बचा ढेर विजेता को जाता है।" },
  r_r5: { en: "Collect seven or more of the 13 tricks to win the hand (+1 point). All thirteen is a clean sweep (+2).", pa: "13 ਹੱਥ ਵਿਚੋण ਸात ਜा ਜ਼ਿਆदा ਚੁੱਕੋ (+1 ਅंक)। सारे 13 ਸਾਫ਼ ਸਵीप है (+2)।", hi: "13 हाथों में से सात या अधिक उठाओ (+1 अंक)। सभी 13 क्लीन स्वीप है (+2)।" },

  seq_r1: { en: "Four players in two teams. Partners sit opposite; turns go counter-clockwise (to the right). No trump.", pa: "ਦੋ ਟੀਮ ਵਿਚ 4 ਖਿਡਾਰੀ। ਜੋੜੀदार ਆमने-सामने; ਵਾਰੀ दाईं ਵਲ। కోਈ ਟਰੰਪ ਨਹੀं।", hi: "दो टीमों में 4 खिलाड़ी। जोड़ीदार आमने-सामने; बारी दाईं ओर। कोई ट्रंप नहीं।" },
  seq_r2: { en: "Bid 9 to 13 using a value in your first four cards. The floor is then revealed. Your opening move must capture or drop the bid value, or build that house.", pa: "ਆਪਣੇ ਪਹਿਲੇ ਚਾਰ ਕਾਰਡਾਂ ਵਿਚੋण 9-13 ਬੋਲੀ ਲਗਾਓ। ਮేਜ਼ ਫੇਰ ਲੁਕਿਆ ਨहीं। ਤਢਾਡੀ ਪਹਿਲੀ ਚाल बोली मान से पकड़ जा सुटो जा घर बनाo।", hi: "आपके पहले चार कार्डों में से 9-13 बोली लगाओ। फिर मेज़ दिखने लगता है। आपकी पहली चाल बोली मान से पकड़ या फेंक या घर बनाएँ।" },
  seq_r3: { en: "Ace = 1, Jack = 11, Queen = 12, King = 13. Capture equal cards or separate groups adding to the played value. Matching captures are compulsory unless you build.", pa: "आक = 1, गुलाब = 11, रानी = 12, राजा = 13। बराबर कार्ड या अलग समूहों से पकड़ो (जो मिलकर उस मूल्य को बनाती है)। मिलानी पकड़ ज़रूरी है, ज़बरत घर न बनाएँ।", hi: "आक = 1, गुलाब = 11, रानी = 12, राजा = 13। बराबर कार्ड या अलग समूहों से पकड़ो (जो मिलकर उस मूल्य बनाती है)। मिलानी पकड़ ज़रूरी है, ज़बरत घर न बनाएँ।" },
  seq_r4: { en: "Build houses from 9 to 13 and keep a matching card in hand. Equal sets cement a house. A cemented house cannot be raised. You may raise another player's single house with a hand card.", pa: "9 ਤों 13 ਤक घर बनाओ और मिलान कार्ड हाथ में रखो। बराबर समूह घर सीमेंट करते हैं। सीमेंट घर नहीं उठ सकता। हाथ के कार्ड से दूसरे का घर उठा सकते हो।", hi: "9 से 13 तक घर बनाओ और मिलान कार्ड हाथ में रखो। बराबर समूह घर सीमेंट करते हैं। सीमेंट घर नहीं उठ सकता। हाथ के कार्ड से दूसरे का घर उठा सकते हो।" },
  seq_r5: { en: "Capturing the whole floor is a Seep: +50 points, or +25 on the opening move. The final move gives no sweep bonus. Last capture takes leftover cards.", pa: "पूरी मेज़ जीतना सीप है: +50 अंक, या खोलने वाली चाल पर +25। आखिरी चाल से बोनस नहीं। आखिरी पकड़ बचे हुए कार्ड।", hi: "पूरी मेज़ जीतना सीप है: +50 अंक, या खोलने वाली चाल पर +25। आखिरी चाल से बोनस नहीं। आखिरी पकड़ बचे हुए कार्ड।" },
  seq_r6: { en: "Spades score their value, other Aces score 1, and the 10 of Diamonds scores 6. There are 100 card points. A 100-point cumulative lead wins a baazi; scoring below 9 loses it immediately.", pa: "ਹੁਕम का अपना मूल्य, बाकी आक 1, हीरे की दस 6। कुल 100 अंक। 100 की जमा बढ़त बाज़ी जीतती है; 9 से कम तुरंत हार।", hi: "हुकम का अपना मूल्य, बाकी आक 1, हीरे की दस 6। कुल 100 अंक। 100 की जमा बढ़त बाज़ी जीतती है; 9 से कम तुरंत हार।" },

  rm_r1: { en: "Ten cards each. Every turn: draw from the deck or take the pile-top, then discard one.", pa: "ਹਰ ਕੋਈ ਕੋल दस ਕਾਰਡ। ਹਰ ਵਾਰੀ: ਡੈਕ ਤੋਂ या पाइल ਦੇ ਉੱਪਰ ਤੋਂ एक ਲਿਓ, ਫের ਇਕ ਸੁੱजो।", hi: "हर कोई के पास दस कार्ड। हर बारी: डेक से या पाईल के ऊपर से एक लो, फिर एक फेंको।" },
  rm_r2: { en: "Melds = sets (3-4 of one rank) or runs (3+ consecutive cards of the same suit).", pa: "ਮେਲ = एक ही रैंक के 3-4 कार्ड जा एक ही सूट के लगातार 3+ कार्ड।", hi: "मेल = एक ही रैंक के 3-4 कार्ड या एक ही सूट के लगातार 3+ कार्ड।" },
  rm_r3: { en: "When your whole hand fits into melds, it's GIN — you win the round instantly.", pa: "ਜदੁ ਤੇਰਾ ਪੂਰा हाथ ਮੇਲ बन जाता है, ਇਹ ਜिन है — ਤੂੰ तुरंत ਜਿੱਤदा ਹੈ।", hi: "जब तेरा पूरा हाथ मेल बन जाता है, यह जिन है — तूं तुरंत जीतता है।" },
};

function pick(key: string, params?: Params): string {
  const entry = dict[key];
  const lang = getLang();
  let raw = entry?.[lang] ?? entry?.en ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) raw = raw.split(`{${k}}`).join(String(v));
  }
  return raw;
}

export function getLang(): Lang {
  try {
    const value = localStorage.getItem(KEY);
    if (value === "pa" || value === "hi") return value;
  } catch { /* default */ }
  return "en";
}

export function setLang(lang: Lang): void {
  try { localStorage.setItem(KEY, lang); } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVENT));
}

export function useLang(): [Lang, (next: Lang) => void] {
  const [lang, setLangState] = useState<Lang>(getLang);
  useEffect(() => {
    const update = () => setLangState(getLang());
    window.addEventListener(EVENT, update);
    return () => window.removeEventListener(EVENT, update);
  }, []);
  return [lang, (next: Lang) => setLang(next)];
}

export function useT(): (key: string, params?: Params) => string {
  useLang(); // subscribe so components re-render on language change
  return (key, params) => pick(key, params);
}

export const LANG_NAMES: Record<Lang, string> = { en: "English", pa: "ਪੰਜਾਬੀ", hi: "हिंदी" };
