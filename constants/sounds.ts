export const AMBIENT_SOUNDS = [
  {
    id: "none",
    title: "Silent",
    file: null,
  },
  {
    id: "cosmic",
    title: "Cosmic Healing (432Hz)",
    file: require("../assets/sounds/432hz-magic-healing-cosmic-sleep-amp-focus-frequency-361117.mp3"),
  },
  {
    id: "corporate",
    title: "Corporate Focus",
    file: require("../assets/sounds/corporate-focus-1-442910.mp3"),
  },
  {
    id: "studying",
    title: "Late Night Focus",
    file: require("../assets/sounds/perfect-for-studying-reading-or-late-night-focus-background-music-361174.mp3"),
  },
  {
    id: "cafe",
    title: "Rainy Study Cafe",
    file: require("../assets/sounds/rainy-study-cafe-409654.mp3"),
  },
  {
    id: "brainpower",
    title: "Brain Power (432Hz)",
    file: require("../assets/sounds/study-music-for-focus-and-brain-power-432-hz.mp3"),
  },
  {
    id: "rain",
    title: "Whispering Rain",
    file: require("../assets/sounds/whispering-rain.mp3"),
  },
];

export const getSoundIcon = (id: string) => {
  switch (id) {
    case "none":
      return "volume-x";
    case "cosmic":
      return "globe";
    case "corporate":
      return "briefcase";
    case "studying":
      return "moon";
    case "cafe":
      return "coffee";
    case "brainpower":
      return "zap";
    case "rain":
      return "cloud-rain";
    default:
      return "music";
  }
};

export const getSoundMetadata = (id: string, customTracks?: any[]) => {
  const custom = customTracks?.find((t) => t.id === id);
  if (custom) {
    return {
      icon: "music",
      gradient: ["#EC4899", "#831843"],
      artist: "Local File",
      description: "User imported audio track",
    };
  }
  switch (id) {
    case "none":
      return {
        icon: "volume-x",
        gradient: ["#374151", "#1F2937"],
        artist: "Silence",
        description: "Silent study ambient"
      };
    case "cosmic":
      return {
        icon: "globe",
        gradient: ["#6366F1", "#312E81"],
        artist: "Cosmic Frequency",
        description: "432Hz deep space frequencies"
      };
    case "corporate":
      return {
        icon: "briefcase",
        gradient: ["#3B82F6", "#1D4ED8"],
        artist: "Deep Focus Lab",
        description: "Binaural beats for high productivity"
      };
    case "studying":
      return {
        icon: "moon",
        gradient: ["#1E1B4B", "#030712"],
        artist: "Lofi Study Beats",
        description: "Late night focus instrumentals"
      };
    case "cafe":
      return {
        icon: "coffee",
        gradient: ["#8B5CF6", "#4C1D95"],
        artist: "Coffee & Rain",
        description: "Warm acoustic cafe atmosphere"
      };
    case "brainpower":
      return {
        icon: "zap",
        gradient: ["#F59E0B", "#78350F"],
        artist: "Alpha Brainwaves",
        description: "432Hz cognitive stimulation"
      };
    case "rain":
      return {
        icon: "cloud-rain",
        gradient: ["#06B6D4", "#0891B2"],
        artist: "Nature Sounds",
        description: "Gentle rain and soft wind"
      };
    default:
      return {
        icon: "music",
        gradient: ["#6B7280", "#374151"],
        artist: "Pebble Ambient",
        description: "Focus soundscape"
      };
  }
};
