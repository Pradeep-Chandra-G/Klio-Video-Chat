class PeerService {
  constructor() {
    this.peers = new Map(); // socketId -> RTCPeerConnection
    this.localStream = null;
  }

  createPeerConnection(socketId, onTrackReceived, onNegotiationNeeded) {
    const peer = new RTCPeerConnection({
      iceServers: [
        {
          urls: [
            "stun:stun.l.google.com:19302",
            "stun:global.stun.twilio.com:3478",
          ],
        },
      ],
    });

    // 🔑 Handle remote stream
    peer.addEventListener("track", (event) => {
      if (onTrackReceived) {
        onTrackReceived(socketId, event.streams[0]);
      }
    });

    // 🔑 Handle negotiation needed
    peer.addEventListener("negotiationneeded", () => {
      if (onNegotiationNeeded) {
        onNegotiationNeeded(socketId);
      }
    });

    // 🔑 Debug ICE connection state
    peer.addEventListener("iceconnectionstatechange", () => {
      console.log(
        `ICE connection state for ${socketId}:`,
        peer.iceConnectionState
      );
    });

    this.peers.set(socketId, peer);
    return peer;
  }

  getPeerConnection(socketId) {
    return this.peers.get(socketId);
  }

  async createOffer(socketId) {
    const peer =
      this.getPeerConnection(socketId) || this.createPeerConnection(socketId);

    this._addLocalTracks(peer);

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    return offer;
  }

  async createAnswer(socketId, offer) {
    const peer =
      this.getPeerConnection(socketId) || this.createPeerConnection(socketId);

    await peer.setRemoteDescription(offer);

    this._addLocalTracks(peer);

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    return answer;
  }

  async setRemoteDescription(socketId, description) {
    const peer = this.getPeerConnection(socketId);
    if (peer) {
      await peer.setRemoteDescription(description);
    }
  }

  setLocalStream(stream) {
    this.localStream = stream;
  }

  getLocalStream() {
    return this.localStream;
  }

  // ✅ Internal helper: safely add local tracks (no duplicates)
  _addLocalTracks(peer) {
    if (!this.localStream) return;

    const senders = peer.getSenders();
    this.localStream.getTracks().forEach((track) => {
      const alreadyAdded = senders.some((s) => s.track === track);
      if (!alreadyAdded) {
        peer.addTrack(track, this.localStream);
      }
    });
  }

  closePeerConnection(socketId) {
    const peer = this.peers.get(socketId);
    if (peer) {
      peer.close();
      this.peers.delete(socketId);
    }
  }

  closeAllConnections() {
    this.peers.forEach((peer) => {
      peer.close();
    });
    this.peers.clear();

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        track.stop();
      });
      this.localStream = null;
    }
  }
}

export default new PeerService();
