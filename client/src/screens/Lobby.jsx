import React, { useState, useCallback, useEffect } from "react";
import { useSocket } from "../context/SocketProvider";
import { useNavigate } from "react-router-dom";

import {
  Users,
  Video,
  Mail,
  Hash,
  ArrowRight,
  AlertCircle,
} from "lucide-react";

const LobbyScreen = () => {
  const socket = useSocket();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [room, setRoom] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Mock socket and navigate for demo
  //   const socket = {
  //     emit: (event, data) => console.log("Socket emit:", event, data),
  //     on: () => {},
  //     off: () => {},
  //   };
  //   const navigate = (path) => console.log("Navigate to:", path);

  const handleSubmitForm = useCallback(
    (e) => {
      if (e) e.preventDefault();
      if (!email.trim() || !room.trim()) {
        setError("Please fill in all fields");
        return;
      }

      setIsLoading(true);
      setError("");
      socket.emit("room:join", { email: email.trim(), room: room.trim() });
    },
    [email, room, socket]
  );

  const handleJoinRoom = useCallback(
    (data) => {
      setIsLoading(false);
      const { room } = data;
      navigate(`/room/${room}`);
    },
    [navigate]
  );

  const handleRoomFull = useCallback(() => {
    setIsLoading(false);
    setError("Room is full! Maximum 10 participants allowed.");
  }, []);

  useEffect(() => {
    document.title = 'Klio';
    socket.on("room:join", handleJoinRoom);
    socket.on("room:full", handleRoomFull);

    return () => {
      socket.off("room:join", handleJoinRoom);
      socket.off("room:full", handleRoomFull);
    };
  }, [socket, handleJoinRoom, handleRoomFull]);

  const generateRandomRoom = () => {
    const randomRoom = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoom(randomRoom);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full opacity-20 blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500 rounded-full opacity-20 blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-pink-500 rounded-full opacity-10 blur-3xl"></div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 backdrop-blur-sm rounded-2xl mb-4">
            <Video className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">Klio</h1>
          <p className="text-indigo-200">
            Connect with up to 10 people instantly
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 shadow-2xl border border-white/20">
          <div className="space-y-6">
            {/* Email Input */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-white mb-2"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-indigo-300 w-5 h-5" />
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-white/5 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all duration-200"
                  placeholder="Enter your email"
                />
              </div>
            </div>

            {/* Room Input */}
            <div>
              <label
                htmlFor="room"
                className="block text-sm font-medium text-white mb-2"
              >
                Room Code
              </label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 text-indigo-300 w-5 h-5" />
                <input
                  type="text"
                  id="room"
                  value={room}
                  onChange={(e) => setRoom(e.target.value.toUpperCase())}
                  className="w-full pl-12 pr-24 py-3 bg-white/5 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all duration-200"
                  placeholder="ROOM123"
                />
                <button
                  type="button"
                  onClick={generateRandomRoom}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 px-3 py-1.5 text-xs text-indigo-300 hover:text-white border border-indigo-300/50 hover:border-white/50 rounded-lg transition-colors duration-200"
                >
                  Random
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center space-x-2 text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {/* Join Button */}
            <button
              onClick={handleSubmitForm}
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 disabled:from-gray-500 disabled:to-gray-600 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-300 flex items-center justify-center space-x-2 shadow-lg hover:shadow-xl disabled:cursor-not-allowed transform hover:scale-105 disabled:transform-none"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Joining...</span>
                </>
              ) : (
                <>
                  <span>Join Meeting</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>

          {/* Features */}
          <div className="mt-8 pt-6 border-t border-white/10">
            <div className="flex items-center justify-center space-x-6 text-indigo-200 text-sm">
              <div className="flex items-center space-x-1">
                <Users className="w-4 h-4" />
                <span>Up to 10 users</span>
              </div>
              <div className="flex items-center space-x-1">
                <Video className="w-4 h-4" />
                <span>HD Video</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-indigo-300 text-sm">
            Secure • No registration required • Free to use
          </p>
        </div>
      </div>
    </div>
  );
};

export default LobbyScreen;
