import React, { useEffect, useCallback, useState } from "react";
import ReactPlayer from "react-player";
import peer from "../service/peer";
import { useSocket } from "../context/SocketProvider";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Phone,
  Users,
  Monitor,
  Copy,
  Check,
  Settings,
  MoreVertical,
  PhoneOff,
  MessageCircle,
  Shield,
} from "lucide-react";

const RoomPage = () => {
  const socket = useSocket();
  const [participants, setParticipants] = useState(new Map()); // socketId -> {email, stream, isAudioOn, isVideoOn}
  const [myStream, setMyStream] = useState(null);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);

  // Handle new user joining
  const handleUserJoined = useCallback(
    async ({ email, id }) => {
      console.log(`User ${email} joined with id ${id}`);

      // Add participant to state
      setParticipants(
        (prev) =>
          new Map(
            prev.set(id, {
              email,
              stream: null,
              isAudioOn: true,
              isVideoOn: true,
            })
          )
      );

      // Create offer for new participant
      if (myStream) {
        try {
          const offer = await peer.createOffer(id);
          socket.emit("user:call", { to: id, offer });
        } catch (error) {
          console.error("Error creating offer:", error);
        }
      }
    },
    [socket, myStream]
  );

  // Handle incoming call
  const handleIncomingCall = useCallback(
    async ({ from, offer }) => {
      console.log(`Incoming call from ${from}`);

      try {
        // Get user media if not already available
        if (!myStream) {
          const stream = await getUserMedia();
          setMyStream(stream);
          peer.setLocalStream(stream);
        }

        const answer = await peer.createAnswer(from, offer);
        socket.emit("call:accepted", { to: from, ans: answer });
      } catch (error) {
        console.error("Error handling incoming call:", error);
      }
    },
    [socket, myStream]
  );

  // Handle call accepted
  const handleCallAccepted = useCallback(async ({ from, ans }) => {
    console.log(`Call accepted by ${from}`);

    try {
      await peer.setRemoteDescription(from, ans);
    } catch (error) {
      console.error("Error setting remote description:", error);
    }
  }, []);

  // Handle user leaving
  const handleUserLeft = useCallback(({ id, email }) => {
    console.log(`User ${email} left`);

    // Remove participant
    setParticipants((prev) => {
      const newMap = new Map(prev);
      newMap.delete(id);
      return newMap;
    });

    // Close peer connection
    peer.closePeerConnection(id);
  }, []);

  // Handle participant media toggles
  const handleParticipantAudioToggle = useCallback(
    ({ participantId, isAudioOn }) => {
      setParticipants((prev) => {
        const newMap = new Map(prev);
        const participant = newMap.get(participantId);
        if (participant) {
          newMap.set(participantId, { ...participant, isAudioOn });
        }
        return newMap;
      });
    },
    []
  );

  const handleParticipantVideoToggle = useCallback(
    ({ participantId, isVideoOn }) => {
      setParticipants((prev) => {
        const newMap = new Map(prev);
        const participant = newMap.get(participantId);
        if (participant) {
          newMap.set(participantId, { ...participant, isVideoOn });
        }
        return newMap;
      });
    },
    []
  );

  // Handle negotiation
  const handleNegoNeeded = useCallback(
    async (socketId) => {
      try {
        const offer = await peer.createOffer(socketId);
        socket.emit("peer:nego:needed", { offer, to: socketId });
      } catch (error) {
        console.error("Error in negotiation:", error);
      }
    },
    [socket]
  );

  const handleNegoNeedIncoming = useCallback(
    async ({ from, offer }) => {
      try {
        const answer = await peer.createAnswer(from, offer);
        socket.emit("peer:nego:done", { to: from, ans: answer });
      } catch (error) {
        console.error("Error handling incoming negotiation:", error);
      }
    },
    [socket]
  );

  const handleNegoNeedFinal = useCallback(async ({ from, ans }) => {
    try {
      await peer.setRemoteDescription(from, ans);
    } catch (error) {
      console.error("Error handling final negotiation:", error);
    }
  }, []);

  // Get user media with fallbacks
  const getUserMedia = async () => {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
    } catch (err) {
      console.warn("Camera access denied, trying audio only:", err);
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
      } catch (audioErr) {
        console.error("Audio access also denied:", audioErr);
        throw audioErr;
      }
    }
  };

  // Toggle local audio
  const toggleAudio = useCallback(() => {
    if (myStream) {
      const audioTrack = myStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioOn(audioTrack.enabled);
        socket.emit("toggle:audio", {
          room: roomId,
          isAudioOn: audioTrack.enabled,
        });
      }
    }
  }, [myStream, socket, roomId]);

  // Toggle local video
  const toggleVideo = useCallback(() => {
    if (myStream) {
      const videoTrack = myStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOn(videoTrack.enabled);
        socket.emit("toggle:video", {
          room: roomId,
          isVideoOn: videoTrack.enabled,
        });
      }
    }
  }, [myStream, socket, roomId]);

  // Screen sharing
  const toggleScreenShare = useCallback(async () => {
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });

        // Replace video track in all peer connections
        const videoTrack = screenStream.getVideoTracks()[0];
        participants.forEach((_, socketId) => {
          const peerConnection = peer.getPeerConnection(socketId);
          if (peerConnection) {
            const sender = peerConnection
              .getSenders()
              .find((s) => s.track && s.track.kind === "video");
            if (sender) {
              sender.replaceTrack(videoTrack);
            }
          }
        });

        setIsScreenSharing(true);

        // Handle screen share ending
        videoTrack.onended = () => {
          setIsScreenSharing(false);
          // Switch back to camera
          if (myStream) {
            const cameraTrack = myStream.getVideoTracks()[0];
            participants.forEach((_, socketId) => {
              const peerConnection = peer.getPeerConnection(socketId);
              if (peerConnection) {
                const sender = peerConnection
                  .getSenders()
                  .find((s) => s.track && s.track.kind === "video");
                if (sender && cameraTrack) {
                  sender.replaceTrack(cameraTrack);
                }
              }
            });
          }
        };
      } else {
        // Stop screen sharing manually
        if (myStream) {
          const cameraTrack = myStream.getVideoTracks()[0];
          participants.forEach((_, socketId) => {
            const peerConnection = peer.getPeerConnection(socketId);
            if (peerConnection) {
              const sender = peerConnection
                .getSenders()
                .find((s) => s.track && s.track.kind === "video");
              if (sender && cameraTrack) {
                sender.replaceTrack(cameraTrack);
              }
            }
          });
        }
        setIsScreenSharing(false);
      }
    } catch (error) {
      console.error("Screen sharing error:", error);
    }
  }, [isScreenSharing, myStream, participants]);

  // Leave room
  const leaveRoom = useCallback(() => {
    // Stop all media tracks
    if (myStream) {
      myStream.getTracks().forEach((track) => track.stop());
    }

    // Close all peer connections
    peer.closeAllConnections();

    // Navigate back to lobby (in real app)
    window.location.href = "/";
  }, [myStream]);

  // Copy room ID
  const copyRoomId = useCallback(() => {
    navigator.clipboard.writeText(roomId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [roomId]);

  // Initialize media and peer connections
  useEffect(() => {
    const initializeMedia = async () => {
      try {
        const stream = await getUserMedia();
        setMyStream(stream);
        peer.setLocalStream(stream);

        // Set up track handling for all participants
        participants.forEach((_, socketId) => {
          peer.setupPeerConnectionListeners(
            socketId,
            (participantId, remoteStream) => {
              setParticipants((prev) => {
                const newMap = new Map(prev);
                const participant = newMap.get(participantId);
                if (participant) {
                  newMap.set(participantId, {
                    ...participant,
                    stream: remoteStream,
                  });
                }
                return newMap;
              });
            },
            handleNegoNeeded
          );
        });
      } catch (error) {
        console.error("Failed to initialize media:", error);
      }
    };

    initializeMedia();

    // Get room ID from URL
    const pathSegments = window.location.pathname.split("/");
    const currentRoomId = pathSegments[pathSegments.length - 1];
    setRoomId(currentRoomId);

    return () => {
      if (myStream) {
        myStream.getTracks().forEach((track) => track.stop());
      }
      peer.closeAllConnections();
    };
  }, []);

  // Socket event listeners
  useEffect(() => {
    socket.on("user:joined", handleUserJoined);
    socket.on("user:left", handleUserLeft);
    socket.on("incoming:call", handleIncomingCall);
    socket.on("call:accepted", handleCallAccepted);
    socket.on("peer:nego:needed", handleNegoNeedIncoming);
    socket.on("peer:nego:final", handleNegoNeedFinal);
    socket.on("participant:audio:toggle", handleParticipantAudioToggle);
    socket.on("participant:video:toggle", handleParticipantVideoToggle);

    return () => {
      socket.off("user:joined", handleUserJoined);
      socket.off("user:left", handleUserLeft);
      socket.off("incoming:call", handleIncomingCall);
      socket.off("call:accepted", handleCallAccepted);
      socket.off("peer:nego:needed", handleNegoNeedIncoming);
      socket.off("peer:nego:final", handleNegoNeedFinal);
      socket.off("participant:audio:toggle", handleParticipantAudioToggle);
      socket.off("participant:video:toggle", handleParticipantVideoToggle);
    };
  }, [
    socket,
    handleUserJoined,
    handleUserLeft,
    handleIncomingCall,
    handleCallAccepted,
    handleNegoNeedIncoming,
    handleNegoNeedFinal,
    handleParticipantAudioToggle,
    handleParticipantVideoToggle,
  ]);

  // Dynamic grid layout calculation - Zoom-like
  const getOptimalLayout = (count) => {
    if (count === 1) return { cols: 1, rows: 1, aspectClass: "aspect-video" };
    if (count === 2) return { cols: 2, rows: 1, aspectClass: "aspect-video" };
    if (count <= 4) return { cols: 2, rows: 2, aspectClass: "aspect-video" };
    if (count <= 6) return { cols: 3, rows: 2, aspectClass: "aspect-[4/3]" };
    if (count <= 9) return { cols: 3, rows: 3, aspectClass: "aspect-[4/3]" };
    if (count <= 12) return { cols: 4, rows: 3, aspectClass: "aspect-[4/3]" };
    return { cols: 4, rows: 4, aspectClass: "aspect-square" };
  };

  const getInitials = (email) => {
    return email.split("@")[0].substring(0, 2).toUpperCase();
  };

  const totalParticipants = participants.size + 1; // +1 for self
  const participantsList = Array.from(participants.entries());
  const layout = getOptimalLayout(totalParticipants);

  return (
    <div className="h-screen bg-gray-900 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700/50 px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-lg font-semibold text-white">Room {roomId}</h1>
            <button
              onClick={copyRoomId}
              className="flex items-center space-x-2 bg-gray-700/50 hover:bg-gray-600/50 rounded-lg px-3 py-1.5 transition-colors"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : (
                <Copy className="w-4 h-4 text-gray-300" />
              )}
              <span className="text-sm text-gray-300">
                {copied ? "Copied!" : "Copy Room ID"}
              </span>
            </button>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-gray-300">
              <Users className="w-5 h-5" />
              <span className="text-sm">{totalParticipants}/10</span>
            </div>

            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 hover:bg-gray-700/50 rounded-lg transition-colors"
            >
              <MoreVertical className="w-5 h-5 text-gray-300" />
            </button>
          </div>
        </div>
      </div>

      {/* Main video container - takes remaining height, no overflow */}
      <div className="flex-1 p-3 min-h-0">
        <div
          className={`h-full w-full grid gap-2`}
          style={{
            gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
            gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
          }}
        >
          {/* Local video (self) */}
          <div className="relative bg-gray-800 rounded-lg overflow-hidden min-h-0">
            <div className={`w-full h-full ${layout.aspectClass}`}>
              {myStream && isVideoOn ? (
                <ReactPlayer
                  playing
                  muted
                  width="100%"
                  height="100%"
                  url={myStream}
                  style={{
                    borderRadius: "0.5rem",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-600 to-blue-600">
                  <div className="text-center">
                    {!isVideoOn && (
                      <VideoOff className="w-8 h-8 text-white mx-auto mb-2" />
                    )}
                    <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white text-lg font-bold">
                      You
                    </div>
                  </div>
                </div>
              )}

              {/* Controls overlay */}
              <div className="absolute bottom-2 left-2 bg-black/50 backdrop-blur-sm rounded-md px-2 py-1">
                <span className="text-white text-xs font-medium">You</span>
              </div>

              {!isAudioOn && (
                <div className="absolute top-2 right-2 bg-red-500 rounded-full p-1.5">
                  <MicOff className="w-3 h-3 text-white" />
                </div>
              )}
            </div>
          </div>

          {/* Remote participants */}
          {participantsList.map(([socketId, participant]) => (
            <div
              key={socketId}
              className="relative bg-gray-800 rounded-lg overflow-hidden min-h-0"
            >
              <div className={`w-full h-full ${layout.aspectClass}`}>
                {participant.stream && participant.isVideoOn ? (
                  <ReactPlayer
                    playing
                    width="100%"
                    height="100%"
                    url={participant.stream}
                    style={{
                      borderRadius: "0.5rem",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-600">
                    <div className="text-center">
                      {!participant.isVideoOn && (
                        <VideoOff className="w-8 h-8 text-white mx-auto mb-2" />
                      )}
                      <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white text-lg font-bold">
                        {getInitials(participant.email)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Participant name overlay */}
                <div className="absolute bottom-2 left-2 bg-black/50 backdrop-blur-sm rounded-md px-2 py-1">
                  <span className="text-white text-xs font-medium">
                    {participant.email.split("@")[0]}
                  </span>
                </div>

                {/* Audio indicator */}
                {!participant.isAudioOn && (
                  <div className="absolute top-2 right-2 bg-red-500 rounded-full p-1.5">
                    <MicOff className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Control Panel */}
      <div className="bg-gray-800/50 backdrop-blur-sm border-t border-gray-700/50 p-4 flex-shrink-0">
        <div className="flex items-center justify-center space-x-4">
          {/* Audio toggle */}
          <button
            onClick={toggleAudio}
            className={`p-3 rounded-full transition-all ${
              isAudioOn
                ? "bg-gray-700/50 hover:bg-gray-600/50 text-white"
                : "bg-red-500 hover:bg-red-600 text-white"
            }`}
            title={isAudioOn ? "Mute microphone" : "Unmute microphone"}
          >
            {isAudioOn ? (
              <Mic className="w-6 h-6" />
            ) : (
              <MicOff className="w-6 h-6" />
            )}
          </button>

          {/* Video toggle */}
          <button
            onClick={toggleVideo}
            className={`p-3 rounded-full transition-all ${
              isVideoOn
                ? "bg-gray-700/50 hover:bg-gray-600/50 text-white"
                : "bg-red-500 hover:bg-red-600 text-white"
            }`}
            title={isVideoOn ? "Turn off camera" : "Turn on camera"}
          >
            {isVideoOn ? (
              <Video className="w-6 h-6" />
            ) : (
              <VideoOff className="w-6 h-6" />
            )}
          </button>

          {/* Screen share */}
          <button
            onClick={toggleScreenShare}
            className={`p-3 rounded-full transition-all ${
              isScreenSharing
                ? "bg-blue-500 hover:bg-blue-600 text-white"
                : "bg-gray-700/50 hover:bg-gray-600/50 text-white"
            }`}
            title={isScreenSharing ? "Stop sharing" : "Share screen"}
          >
            <Monitor className="w-6 h-6" />
          </button>

          {/* Participants */}
          <button
            onClick={() => setShowParticipants(!showParticipants)}
            className="p-3 rounded-full bg-gray-700/50 hover:bg-gray-600/50 text-white transition-all"
            title="Show participants"
          >
            <Users className="w-6 h-6" />
          </button>

          {/* Chat */}
          <button
            className="p-3 rounded-full bg-gray-700/50 hover:bg-gray-600/50 text-white transition-all"
            title="Chat"
          >
            <MessageCircle className="w-6 h-6" />
          </button>

          {/* Settings */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-3 rounded-full bg-gray-700/50 hover:bg-gray-600/50 text-white transition-all"
            title="Settings"
          >
            <Settings className="w-6 h-6" />
          </button>

          {/* Leave call */}
          <button
            onClick={leaveRoom}
            className="p-3 rounded-full bg-red-500 hover:bg-red-600 text-white transition-all ml-6"
            title="Leave room"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Participants Panel */}
      {showParticipants && (
        <div className="absolute right-4 top-20 bottom-20 w-80 bg-gray-800/95 backdrop-blur-sm rounded-xl border border-gray-700/50 p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">
              Participants ({totalParticipants})
            </h3>
            <button
              onClick={() => setShowParticipants(false)}
              className="text-gray-400 hover:text-white"
            >
              ×
            </button>
          </div>

          <div className="space-y-2">
            {/* Self */}
            <div className="flex items-center space-x-3 p-2 bg-gray-700/30 rounded-lg">
              <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                You
              </div>
              <span className="text-white text-sm">You</span>
              <div className="ml-auto flex space-x-1">
                {!isAudioOn && <MicOff className="w-4 h-4 text-red-400" />}
                {!isVideoOn && <VideoOff className="w-4 h-4 text-red-400" />}
              </div>
            </div>

            {/* Remote participants */}
            {participantsList.map(([socketId, participant]) => (
              <div
                key={socketId}
                className="flex items-center space-x-3 p-2 bg-gray-700/30 rounded-lg"
              >
                <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center text-white text-xs font-medium">
                  {getInitials(participant.email)}
                </div>
                <span className="text-white text-sm">
                  {participant.email.split("@")[0]}
                </span>
                <div className="ml-auto flex space-x-1">
                  {!participant.isAudioOn && (
                    <MicOff className="w-4 h-4 text-red-400" />
                  )}
                  {!participant.isVideoOn && (
                    <VideoOff className="w-4 h-4 text-red-400" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="absolute right-4 top-20 bottom-20 w-80 bg-gray-800/95 backdrop-blur-sm rounded-xl border border-gray-700/50 p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Settings</h3>
            <button
              onClick={() => setShowSettings(false)}
              className="text-gray-400 hover:text-white"
            >
              ×
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-gray-300 text-sm font-medium block mb-2">
                Camera Quality
              </label>
              <select className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm">
                <option>HD (720p)</option>
                <option>Full HD (1080p)</option>
                <option>4K (2160p)</option>
              </select>
            </div>

            <div>
              <label className="text-gray-300 text-sm font-medium block mb-2">
                Audio Quality
              </label>
              <select className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm">
                <option>Standard</option>
                <option>High</option>
                <option>Crystal Clear</option>
              </select>
            </div>

            <div className="pt-4 border-t border-gray-700">
              <button
                onClick={leaveRoom}
                className="w-full bg-red-500/20 text-red-400 rounded-lg px-3 py-2 text-sm hover:bg-red-500/30 transition-colors"
              >
                Leave Meeting
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoomPage;
