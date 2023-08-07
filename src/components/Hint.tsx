import { CogsConnection, CogsPluginManifestJson, CogsPluginManifestJsonReadonly } from '@clockworkdog/cogs-client';
import React from 'react';
import useHint from '../hooks/useHint';
import { useCogsConnection } from '../providers/CogsConnectionProvider';
import {} from '@clockworkdog/cogs-client/dist/types/ManifestTypes';

export default function Hint<Manifest extends CogsPluginManifestJson | CogsPluginManifestJsonReadonly>({
  connection: customConnection,
}: {
  connection: CogsConnection<Manifest>;
}): JSX.Element | null {
  const providerConnection = useCogsConnection();
  const connection = customConnection ?? providerConnection;
  const hint = useHint(connection);
  return hint ? <>{hint}</> : null;
}
