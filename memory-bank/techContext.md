# Tech Context

## Stack
-   **Mobile**: React Native, Expo.
-   **Web**: Next.js.

## Dependencies
-   `expo-router`: For navigation.
-   `react-native-gesture-handler`: **CRITICAL**: Must wrap the app in `GestureHandlerRootView` for proper touch handling, especially when using `react-native-reanimated` or when `Touchable` components behave inconsistently.
-   `@supabase/supabase-js`: For backend interaction.
-   `date-fns`: For date manipulation.

## Technical Constraints
-   **Nested ScrollViews**: When nesting a `ScrollView` (e.g., in a component) inside a `FlatList` (which is a `VirtualizedList`), `nestedScrollEnabled={true}` must be set on the inner `ScrollView` for Android compatibility.
