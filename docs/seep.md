# Seep

Seep is a separate game under `src/seep/`. Only the app router and main chooser
are changed outside this module. Rang and Bhabhi code and gameplay are untouched.
Names, card artwork conventions, game sounds, team-lobby helpers, room connection
helpers, and opt-in voice chat are reused without changing their implementations.

## Rules

This is the four-player, two-team **100-card-point** version, not the 30-point
regional variant. Partners sit opposite, and turns go counterclockwise (to the
right). The first bidder is the local player/host; dealer rules determine later
deals. The first bidder sees four cards and must bid a held value from 9 to 13;
hands without such a card are redealt. The floor stays hidden until that bid.

The opening move builds the bid-value house or plays the bid value to capture or
drop. The remaining cards are then dealt, giving 12 cards per player over the
whole deal, with the bidder having already played one. Each deal has 48 moves.

- Capture values: Ace 1, Jack 11, Queen 12, King 13, numbers at face value.
- Captures use equal cards, houses of exactly that value, and disjoint loose-card
  sets summing to that value. Any additional matching sets must also be captured.
  Overlapping alternatives are allowed, but a card cannot be counted twice.
- Houses have values 9 through 13. Creators and opposing cementers must retain a
  matching card. A partner may add to a partner-owned house without a reserve.
- Single houses owned by another player may be raised with only the hand card.
  Own houses and cemented houses cannot be raised. Equal-valued houses merge.
- Matching loose cards and sets are automatically incorporated when building or
  cementing. The app chooses disjoint extra sets by points, then card count.
- A non-building move must capture if possible; otherwise it drops the hand card.
- Sweeps score 50, except the opening sweep scores 25 and the last move scores 0.
- Spades score their capture value, other Aces score 1, and diamond 10 scores 6.
  These add to exactly 100 before sweep bonuses. The last capturer gets leftovers.
- The difference between teams' deal scores accumulates. A lead of at least 100
  wins a baazi; scoring below 9 in a deal loses the baazi immediately. A new baazi
  resets the lead while retaining the baazi tally.

Reference: https://www.pagat.com/fishing/seep.html

## Controls

Choose a hand card, then select loose cards or houses on the floor. **Capture**
collects the selection, **Build house** uses the selected 9-13 value, and **Drop**
plays the card loose when legal. **Auto pick** suggests a complete legal capture.
**Suggest build** selects a possible house for the chosen value; floor selection
can be changed manually for other valid combinations. House contents can be
inspected. Invalid moves show a reason and do not change the game.

## Online

Both players must choose Seep before creating or joining. Seep rooms use their own
`seep-card-v1-` namespace. Guests explicitly choose Team A (with the host) or Team B
(against the host). Empty seats become bots. Teams lock when the game starts and
late joins are not accepted. A disconnected player is replaced by a bot.

The host validates the action, seat, revision, deal number, bid, capture sets,
house ownership, and retained-card obligations. Guests receive only their own
hand plus public floor and score information. Opposing hands and the undealt deck
are not sent. Voice is opt-in and uses the existing room voice module.

Keep the host tab open. HTTPS, microphone permissions, PeerJS availability, and
the same WebRTC/network limits as the other games apply. The host advances deals.

## Verification

`tests/seep.test.ts` covers capture values, 100-point scoring, private bidding,
the opening deal, exact sums and overlapping sets, compulsory captures, houses,
cementing, raising, retained cards, sweeps, leftovers, and seeded full bot deals.
With Node.js 22.18+ run `node --test tests/seep.test.ts`.

Manual checks should cover bidding and capturing on a narrow phone, creating and
raising houses, reaching a baazi, joining from a second device, team selection,
bot replacement, private hands, and voice chat. A successful production build does
not verify live WebRTC or microphone operation on real devices.