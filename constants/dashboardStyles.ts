import { Dimensions, Platform, StyleSheet } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_GAP = 10;
const CARD_WIDTH = (SCREEN_WIDTH - 32 - CARD_GAP) / 2; // 2 columns (pill widgets)

export const styles = StyleSheet.create({
  safeArea: { flex: 1, paddingTop: Platform.OS === "android" ? 44 : 0 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 20,
    paddingBottom: 120,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  greetingWrap: { gap: 2 },
  greetingTime: { fontSize: 13, fontWeight: "500" },
  greeting: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },

  profileHeaderWrap: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  profileHeaderCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  avatarNotifDot: {
    position: "absolute",
    top: 1,
    right: 1,
    width: 8,
    height: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bellButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
    borderWidth: 1,
  },
  bellDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  profileHeaderBadge: {
    position: "absolute",
    top: -1,
    right: -3,
    minWidth: 18,
    height: 14,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  profileHeaderBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    color: "#ffffff",
    lineHeight: 12,
  },

  // Hero Pebble
  heroCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    overflow: "hidden",
  },
  heroGlowWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
  },
  heroContent: { gap: 8 },
  heroIconRow: { flexDirection: "row", alignItems: "center" },
  pebbleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  pebbleChipText: { fontSize: 9, fontWeight: "800", letterSpacing: 1.5 },
  heroText: { fontSize: 16, fontWeight: "600", lineHeight: 22 },

  // Categories
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: CARD_GAP,
  },
  categoryCard: {
    width: CARD_WIDTH,
    height: 56,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  catIconWrap: { alignSelf: "center" },
  catName: { fontSize: 12, fontWeight: "700", marginTop: 0 },
  catCount: { fontSize: 16, fontWeight: "800" },
  catBgDecorator: {
    position: "absolute",
    right: -8,
    bottom: -14,
    zIndex: 0,
  },

  // Progress
  progressCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
  },
  progressLeft: { gap: 4, flex: 1, paddingRight: 12 },
  cardKicker: { fontSize: 10, fontWeight: "700", letterSpacing: 1.5 },
  progressTitle: { fontSize: 20, fontWeight: "800" },
  progressSub: { fontSize: 13, fontWeight: "500" },

  // Insight
  insightStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  insightPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  insightText: { fontSize: 13, fontWeight: "600" },
  insightMeta: { fontSize: 11, fontWeight: "500" },

  // Tasks
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700" },
  tasksList: { gap: 8 },
  taskCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  taskAccent: {
    width: 4,
    height: 28,
    borderRadius: 2,
  },
  taskContent: { flex: 1, gap: 2 },
  taskTitle: { fontSize: 14, fontWeight: "600" },
  taskMeta: { fontSize: 12, fontWeight: "500" },
  catBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  catBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  todoCompleteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTasks: {
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 20,
    padding: 28,
    justifyContent: "center",
  },
  emptyText: { fontSize: 13, fontWeight: "500" },

  segmentContainer: {
    flexDirection: "row",
    borderRadius: 14,
    padding: 4,
    marginBottom: 12,
  },
  segmentButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
  },
  segmentActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "600",
  },
  filterPillsRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 12,
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 11,
  },

  // Quick Actions
  quickRow: {
    flexDirection: "row",
    gap: 10,
  },
  quickCard: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  quickLabel: { fontSize: 13, fontWeight: "700" },
  quickSub: { fontSize: 10, fontWeight: "500" },

  // Reminder
  reminderCard: { padding: 14 },
  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  reminderIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  reminderTitle: { fontSize: 14, fontWeight: "700" },
  reminderSub: { fontSize: 12, fontWeight: "500" },
});
