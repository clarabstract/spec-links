import { readGherkinFeature } from './read-gherkin-feature.mjs';
import { readGraphqlDefinitions } from './read-graphql-definitions.mjs';
import { readYamlKeys } from './read-yaml-keys.mjs';

/**
 * One reader per file type, by extension. A reader takes the file's
 * text and returns `{ root, line }`: the tree of keys a path can name
 * and the line the file itself resolves to. A file type with no
 * reader has no keys and resolves to line 1.
 */
export const defaultFileReaders = {
  '.yaml': readYamlKeys,
  '.yml': readYamlKeys,
  '.graphql': readGraphqlDefinitions,
  '.gql': readGraphqlDefinitions,
  '.feature': readGherkinFeature,
};
