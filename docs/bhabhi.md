# Bhabhi / Get Away

Bhabhi is separate from Rang and Seep under `src/bhabhi/`. The games share the
saved name, sound setting, and connection helpers, but use their own rules and
tables. The updated Bhabhi table has compass-positioned played cards, a larger
uncluttered play area, readable non-overlapping hand cards, and a clear thulla
pickup result. Rules open in a dialog instead of squeezing the table.

## Rules Used

This implementation supports three to six individual seats, a standard 52-card
deck dealt as evenly as possible (some seats may hold an extra card), no teams,
and no trump. Unoccupied seats are filled with bots. Online rooms currently
support the host plus three friends (four people max); bots mode allows 4, 5,
or 6 players.

1. Deal 13 cards to each player. The Ace of Spades opens.
2. On the first trick every player plays once; follow spades if possible. The whole
   first trick is discarded even when a player has no spades.
3. On later tricks follow the led suit if possible. The first off-suit card is a
   thulla: the trick stops immediately and the highest card of the led suit picks
   up all played cards. Players after the thulla do not play to that trick.
4. If everyone follows suit, discard the played cards. The highest card leads next.
5. Players with no cards get away, except the player who must lead. If that player
   has no cards after a clean trick, they draw one random card from the earlier
   discard pile (excluding the current trick) and must lead it.
6. Continue until exactly one player remains. That player loses the round. The
   optional voluntary hand-taking rule is not included, and the last two players
   continue playing rather than applying an early-defeat shortcut.

Rules reference: https://www.pagat.com/inflation/getaway.html

## Series

Bhabhi optionally runs as a series: Quick round, Best of 3 (first to be Bhabhi
twice ends the series), or Best of 5 (first to be Bhabhi three times). Each
round's loser adds one Bhabhi to their tally. The player(s) with the fewest
tallies when the target is reached win the series. Works offline against bots
and in online rooms with series settings shared by the host.

## Bot Decisions

Bots remember suits that a player has publicly shown they cannot follow and cards
that were publicly picked up. They avoid leading into a known-void next player
when another suit is available, and penalize blindly replaying a card that just
caused a pickup. Known voids are cleared when a pickup gives the player cards of
that suit. Playing a known card removes it from the public-card memory.

The bot does not inspect opponents' hidden cards. A face-down waste draw clears
uncertain suit and discard knowledge. Bots still follow suit, play the compulsory
opening Ace or waste draw, and make a legal move when all choices are risky. It
is legal to replay a picked-up card on a later trick; this update changes strategy,
not that rule. A same-suit card is never a thulla.

## Online Play

Create or join from the **Bhabhi** menu on both devices. These rooms use the
`bhabhi-card-v1-` namespace; Rang room codes cannot join a Bhabhi room. No team
selection is needed because this game is individual play.

The host validates turns, card ownership, follow-suit, round, and state revision.
Each guest receives only their own cards plus public counts. The host must keep
the tab open. A disconnected guest is replaced by a bot. Guests must join before
the first deal; late joins and live seat reclaim are not offered in this version.
The host can deal another round in the same room after the result.

Opt-in voice chat reuses the existing voice module without changing Rang's voice
implementation. Microphone access is requested only after tapping Join voice.
The same HTTPS, browser permission, signaling, and cross-network limitations apply.

## Verification

`tests/bhabhi.test.ts` covers dealing, compulsory Ace of Spades, legal moves, the
opening-trick exception, thulla, pickup, elimination, empty leaders, endgame,
private snapshots, disconnect-to-bot behavior, public suit memory, repeated-pickup
avoidance, hidden-information independence, and full seeded bot simulations.
With Node.js 22.18 or newer run `node --test tests/bhabhi.test.ts`.

Manual checks: select either game, confirm Rang still behaves the same, complete
a Bhabhi bot round, create a Bhabhi room with two devices, play a thulla, verify
hidden hands, disconnect a guest, and play a rematch. Also check voice chat on
real devices and card readability on a narrow phone.

A production build alone does not verify real-device WebRTC or voice behavior.