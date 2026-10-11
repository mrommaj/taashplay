# Online Teams

The start screen has just two choices: **Play with bots** or **Play with friends**.
Sar (2 in a row) is the only rule; there is no rule selector or same-phone setup.
Choose **Play with friends** to create a room or join a friend's room. Team
selection appears only after a guest joins, not on the start screen.

The host is always in Team A. Guests are not assigned a seat until they choose:

- **Team A: with the host.** The guest sits opposite the host as their partner.
- **Team B: against the host.** The guest takes one of the two opposing seats.

Each team has two places. The room shows the same roster on every device. A guest
can change to an available team before play begins. A full team cannot be selected
and never silently redirects the guest to another team.

The Start button stays disabled until at least one friend joins and all connected
guests have chosen a team. Empty places become bots. Two friends can therefore
play together against two bots, or play against each other with one bot each.

Teams are locked after the start. A new guest joining during a game can choose an
available bot place once. Disconnecting frees the guest's place; during a hand, a
bot plays their remaining cards. The host must keep the game tab open.

## Rang Opening Deal

The trump chooser's first five cards must contain at least one Jack, Queen, King,
or Ace (strictly higher than 10). A ten alone does not qualify. Otherwise the whole
deck is reshuffled and all players' opening hands are dealt again automatically.
The same dealer and chooser are retained, no points are awarded, and a redeal does
not count as another hand. This applies equally to human and bot choosers, both
locally and in host-controlled online games. The chooser sees a short notice when
a low hand was redealt.

Picked trick counts and match points now share a compact two-column bar, leaving
more vertical space for the main Rang table. Sar pickup and scoring rules are
unchanged.

## Series for All Games

Every game can be played as a series, chosen on its menu when creating a game or
room (guests share the host's setting):

- **Rang:** Quick game, First to 5, or First to 9 points. The chosen target is
  shown beside the team scores, and reaching it ends the series with a
  champion banner. Starting a new series resets points and match scores for all players.
- **Seep:** Quick game, First to 2 baazis, or First to 3 baazis. The baazi tally
  is retained across deals under the team's points; reaching the target ends the
  series and a new series resets the tally and running lead.
- **Bhabhi:** Quick round, Best of 3, or Best of 5 (first to be Bhabhi 3 or 5
  times). Loss tallies persist across rounds under the hand-cards row.

Series settings and current tallies are synchronized for online play the same way
hands and rules already are.

## Voice Chat

This is live microphone chat, not spoken game announcements. In a room, each
player taps **Join voice** and allows microphone access. All players who join
voice can hear each other, including opponents. Bots do not use voice chat.

- **Mute mic** stops sending microphone audio while you can still listen.
- **Unmute mic** enables your microphone again.
- **Leave voice** stops capture, closes audio connections, and stops playback.
- **Tap to hear players** appears if the browser blocks automatic playback.
- The existing Sound button controls game effects, not microphone chat.

Microphone access is never requested automatically. The old narration preference
does not enable your microphone. Voice remains connected when moving from the
lobby to the table; quitting, navigating away, or losing the room connection
stops capture. Denying microphone permission does not prevent card play.

Audio uses WebRTC links between up to four admitted peers, including
guest-to-guest links. Links may be direct or use the configured Metered relay.
The host distributes the allowed voice roster over the
existing room connection. Calls are checked against the room and each player's
current opt-in session before answering. The app does not record audio.

Use the HTTPS Netlify URL in a regular browser tab and headphones to reduce echo.
Browser microphone permissions, device support, and network restrictions still
apply. The shared configuration supplies Metered TURN for both game data and voice.
A working data connection alone does not verify every participant's audio link.

## Update the Deployed Site

Build the updated project and upload the complete `dist` folder to Netlify. On
Windows PowerShell, use `npm.cmd run build` to avoid script execution policy
errors. Both the host and guests should refresh the site after deployment, then
create a new room. Older clients are asked to update instead of being assigned a
team automatically.

Online play still uses PeerJS/WebRTC. An internet connection and access to the
signaling service are required. Some restrictive networks may block peer-to-peer
connections.

## Room Connection Troubleshooting

The host must wait for **Your Room is Ready** before sharing a code. Keep that tab
open and the screen awake while friends join. Closing or refreshing the host tab
ends the room; the new room has a different code. After sharing an invitation,
return to the game rather than leaving it suspended in a messaging app.

Both players should refresh the same deployed HTTPS URL and use Chrome or Safari,
not an embedded messaging-app browser. Share Invite now includes the actual site
URL as well as the code.

Joining has separate limits for service registration (25 seconds), WebRTC
negotiation (35 seconds), and host confirmation (12 seconds). Transient initial
failures retry up to three attempts. **Try again** retries the same room without
making the guest retype their name or code. Protocol mismatches and room-full
responses do not automatically retry.

Messages distinguish a signaling-service failure, an explicitly unavailable room,
an incomplete device connection, and a host that did not confirm an open data
channel. A timeout alone no longer claims that the host does not exist.

When the signaling connection drops, the app attempts to register the same peer
again, including when the host returns to the tab or internet comes back. Existing
data and voice connections are not intentionally destroyed just to restore
signaling. This does not prevent a phone's operating system from suspending the
browser in the background, and it is not persistent room hosting.

If connection attempts still fail, try a different Wi-Fi or mobile-data network
and disable VPNs. The shared `peerOptions()` in `src/game/connection.ts` now supplies
the operator-provided Metered ICE server array to every Rang, Bhabhi, and Seep peer.
It includes STUN, TURN over UDP and TCP, and TURN over TLS on port 443. The `all`
policy keeps direct connections available and lets WebRTC select a relay when
needed; it does not force every connection to use paid relay bandwidth.

This is configured on the existing PeerJS objects, not an unused standalone
`RTCPeerConnection`. Voice calls inherit the same ICE configuration. PeerJS still
handles room discovery, so TURN cannot fix a wrong code, a closed host tab, or a
failed signaling service.

Allow up to two minutes after creating a Metered credential for it to propagate.
Rebuild and redeploy, refresh both devices, and create a new room. Existing peer
connections do not automatically adopt a changed ICE configuration. Check Metered
usage and browser WebRTC diagnostics for a selected `relay` candidate when testing
across different networks. Neither credential validity nor live relay allocation
has been verified here.

TURN usernames and passwords must be available to WebRTC in the browser and can
be inspected in this static build. These are TURN-only credentials, not a Metered
management Secret Key. Apply quota/expiry limits in Metered and rotate or revoke
the credential if it is shared beyond your intended users. Rotation requires
updating the shared configuration and redeploying. For a public production app,
prefer a server endpoint issuing short-lived credentials; never embed the Metered
management Secret Key in client code. This change does not create or manage your
Metered account or subscription.

## Regression Checks

The pure lobby rules have tests in `tests/lobby.test.ts`. With Node.js 22.18 or
newer, run `node --test tests/lobby.test.ts`. They cover capacity, explicit choices,
switching, disconnects, duplicate messages, late joins, and start gating.

For a real-device check:

1. Create a room on the host device. Join from another device.
2. Confirm the guest sees a team choice and the host cannot start yet.
3. Choose Team A. Confirm both devices show the guest opposite the host.
4. Start and verify the two humans are partners against two bots, with private hands.
5. In a new room choose Team B and verify the humans are opponents.
6. Before starting, switch teams and confirm both rosters update.
7. Join more guests, verify a full team is disabled, and confirm the room accepts
   only four people including the host.
8. Disconnect a player and check that their place opens up and a bot continues
   their hand. Rejoin and choose an available place.

For real-device voice checks:

1. Confirm no microphone permission appears just for opening or joining a room.
2. Tap Join voice on two devices and allow access; verify speech both ways.
3. Mute one microphone; confirm its audio is silent but that player still hears
   the other person. Unmute and check speech resumes.
4. Join two more devices; verify every pair, including guest-to-guest audio.
5. Start the game and confirm voice continues through the trump choice and results.
6. Leave voice, quit the room, and close the page. Verify microphone use stops.
7. Deny permission, cancel a pending permission request, and disconnect the room
   while permission is pending. Verify the game continues and late grants do not
   leave the microphone running.
8. Check the playback-unblock button on mobile and connection failures on a
   restrictive network. No audio connection should be reported as connected
   before WebRTC's ICE connection is established.

Pure voice authorization tests are in `tests/voiceProtocol.test.ts`; with Node.js
22.18 or newer run `node --test tests/voiceProtocol.test.ts`.

Connection-message and timeout-policy tests are in `tests/connection.test.ts`.
Run `node --test tests/connection.test.ts` with the same Node.js version.
Opening-deal regression checks are in `tests/rang-opening.test.ts`, including the
strict greater-than-10 boundary, repeated redeals, all chooser seats, scoring,
deck conservation, and duplicate trump selection. Run
`node --test tests/rang-opening.test.ts` with the same Node.js version.
For live connection checks, test a wrong code, a slow network, a foreground host,
returning from a messaging app, a signaling-service interruption, a Retry click,
and leaving while a retry is pending. Test both same-Wi-Fi and different-network
devices. A successful build is not proof that a particular mobile network allows
WebRTC traffic.

Build verification does not replace these live WebRTC/device checks.