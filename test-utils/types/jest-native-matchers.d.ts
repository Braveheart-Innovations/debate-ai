// Types for the RNTL matchers (toHaveStyle, toHaveTextContent, …) that
// jest.config.js registers at runtime via setupFilesAfterEnv. Including this in
// tsconfig.tests.json makes them visible to every test without per-file imports.
import '@testing-library/react-native/extend-expect';
