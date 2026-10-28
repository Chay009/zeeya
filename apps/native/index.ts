// Background tasks must be registered before any screen loads: Android can
// start the JS runtime for them with no UI, and expo-router only evaluates
// app/_layout.tsx when it renders.
import "@/features/capabilities/background/task";
import "expo-router/entry";
