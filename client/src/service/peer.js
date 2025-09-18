class PeerService {
  constructor() {
    this.peers = new Map(); // socketId -> RTCPeerConnection
    this.localStream = null;
    this.trackHandlers = new Map(); // socketId -> onTrackReceived callback
    this.negoHandlers = new Map(); // socketId -> onNegotiationNeeded callback
  }

  createPeerConnection(socketId, onTrackReceived, onNegotiationNeeded) {
    // Close existing connection if any
    if (this.peers.has(socketId)) {
      this.closePeerConnection(socketId);
    }

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

    // Store handlers
    this.trackHandlers.set(socketId, onTrackReceived);
    this.negoHandlers.set(socketId, onNegotiationNeeded);

    // Handle remote stream
    peer.addEventListener("track", (event) => {
      console.log(`Track received from ${socketId}:`, event.track.kind);
      const [remoteStream] = event.streams;
      if (onTrackReceived && remoteStream) {
        onTrackReceived(socketId, remoteStream);
      }
    });

    // Handle negotiation needed
    peer.addEventListener("negotiationneeded", async () => {
      console.log(`Negotiation needed for ${socketId}`);
      if (onNegotiationNeeded) {
        // Add a small delay to avoid rapid fire negotiations
        setTimeout(() => {
          onNegotiationNeeded(socketId);
        }, 100);
      }
    });

    // Debug ICE connection state
    peer.addEventListener("iceconnectionstatechange", () => {
      console.log(
        `ICE connection state for ${socketId}:`,
        peer.iceConnectionState
      );
    });

    // Handle ICE candidates
    peer.addEventListener("icecandidate", (event) => {
      if (event.candidate) {
        console.log(`ICE candidate for ${socketId}:`, event.candidate);
      }
    });

    // Debug connection state
    peer.addEventListener("connectionstatechange", () => {
      console.log(`Connection state for ${socketId}:`, peer.connectionState);
    });

    this.peers.set(socketId, peer);

    // Add local tracks immediately if stream is available
    this._addLocalTracks(peer);

    return peer;
  }

  getPeerConnection(socketId) {
    return this.peers.get(socketId);
  }

  async createOffer(socketId) {
    let peer = this.getPeerConnection(socketId);

    if (!peer) {
      // Create peer connection with stored handlers
      const onTrackReceived = this.trackHandlers.get(socketId);
      const onNegotiationNeeded = this.negoHandlers.get(socketId);
      peer = this.createPeerConnection(
        socketId,
        onTrackReceived,
        onNegotiationNeeded
      );
    }

    // Ensure local tracks are added before creating offer
    this._addLocalTracks(peer);

    const offer = await peer.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });

    await peer.setLocalDescription(offer);
    console.log(`Created offer for ${socketId}`);
    return offer;
  }

  async createAnswer(socketId, offer) {
    let peer = this.getPeerConnection(socketId);

    if (!peer) {
      // Create peer connection with stored handlers
      const onTrackReceived = this.trackHandlers.get(socketId);
      const onNegotiationNeeded = this.negoHandlers.get(socketId);
      peer = this.createPeerConnection(
        socketId,
        onTrackReceived,
        onNegotiationNeeded
      );
    }

    await peer.setRemoteDescription(new RTCSessionDescription(offer));

    // Add local tracks before creating answer
    this._addLocalTracks(peer);

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    console.log(`Created answer for ${socketId}`);
    return answer;
  }

  async setRemoteDescription(socketId, description) {
    const peer = this.getPeerConnection(socketId);
    if (peer) {
      await peer.setRemoteDescription(new RTCSessionDescription(description));
      console.log(`Set remote description for ${socketId}`);
    } else {
      console.warn(`No peer connection found for ${socketId}`);
    }
  }

  setLocalStream(stream) {
    this.localStream = stream;
    console.log(
      `Local stream set with tracks:`,
      stream.getTracks().map((t) => t.kind)
    );

    // Add tracks to all existing peer connections
    this.peers.forEach((peer, socketId) => {
      this._addLocalTracks(peer);
    });
  }

  getLocalStream() {
    return this.localStream;
  }

  // Internal helper: safely add local tracks (no duplicates)
  _addLocalTracks(peer) {
    if (!this.localStream) {
      console.log("No local stream available to add tracks");
      return;
    }

    const senders = peer.getSenders();
    this.localStream.getTracks().forEach((track) => {
      const existingSender = senders.find((s) => s.track === track);
      if (!existingSender) {
        try {
          peer.addTrack(track, this.localStream);
          console.log(`Added ${track.kind} track to peer connection`);
        } catch (error) {
          console.warn(`Failed to add ${track.kind} track:`, error);
        }
      }
    });
  }

  // Replace a track in all peer connections (for screen sharing)
  async replaceTrack(oldTrack, newTrack) {
    const replacePromises = [];

    this.peers.forEach((peer, socketId) => {
      const sender = peer.getSenders().find((s) => s.track === oldTrack);
      if (sender) {
        replacePromises.push(
          sender
            .replaceTrack(newTrack)
            .then(() => {
              console.log(`Replaced track for ${socketId}`);
            })
            .catch((error) => {
              console.error(`Failed to replace track for ${socketId}:`, error);
            })
        );
      }
    });

    await Promise.all(replacePromises);
  }

  closePeerConnection(socketId) {
    const peer = this.peers.get(socketId);
    if (peer) {
      peer.close();
      this.peers.delete(socketId);
      this.trackHandlers.delete(socketId);
      this.negoHandlers.delete(socketId);
      console.log(`Closed peer connection for ${socketId}`);
    }
  }

  closeAllConnections() {
    this.peers.forEach((peer, socketId) => {
      peer.close();
      console.log(`Closed peer connection for ${socketId}`);
    });

    this.peers.clear();
    this.trackHandlers.clear();
    this.negoHandlers.clear();

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        track.stop();
      });
      this.localStream = null;
      console.log("Stopped local stream");
    }
  }

  // Get connection stats for debugging
  async getConnectionStats(socketId) {
    const peer = this.getPeerConnection(socketId);
    if (peer) {
      const stats = await peer.getStats();
      return stats;
    }
    return null;
  }

  // Get all peer connection states
  getAllConnectionStates() {
    const states = {};
    this.peers.forEach((peer, socketId) => {
      states[socketId] = {
        connectionState: peer.connectionState,
        iceConnectionState: peer.iceConnectionState,
        iceGatheringState: peer.iceGatheringState,
        signalingState: peer.signalingState,
      };
    });
    return states;
  }
}

export default new PeerService();
