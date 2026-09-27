import * as React from 'react'
import { Server as ServerIcon } from 'lucide-react'
import { EmptyState, Panel, PanelAddRow } from '@/components/shared'
import { Input } from '@/components/ui/input'
import { useActions, useServers } from '@/lib/openapi/selectors'
import type { Server } from '@/lib/openapi/types'
import { DraftRow, RowDeleteButton } from './row-actions'

function ServerRow({ server, index }: { server: Server; index: number }) {
  const { updateServer, deleteServer } = useActions()
  const urlId = `server-${index}-url`
  const empty = server.url.trim() === ''
  return (
    <li className="group/row flex items-start gap-2 px-4 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-2 @[40rem]:flex-row">
        <Input
          id={urlId}
          aria-label={`Server ${index + 1} URL`}
          type="url"
          inputMode="url"
          placeholder="https://api.example.com/v1"
          value={server.url}
          onChange={(event) => updateServer(index, { ...server, url: event.target.value })}
          aria-invalid={empty || undefined}
          className="h-7 font-mono text-[12.5px] @[40rem]:flex-[3]"
        />
        <Input
          aria-label={`Server ${index + 1} description`}
          placeholder="Description"
          value={server.description ?? ''}
          onChange={(event) =>
            updateServer(index, { ...server, description: event.target.value === '' ? undefined : event.target.value })
          }
          className="h-7 text-[13px] @[40rem]:flex-[2]"
        />
      </div>
      <RowDeleteButton label={`Delete server ${server.url || index + 1}`} onClick={() => deleteServer(index)} />
    </li>
  )
}

function AddServerRow({ onClose }: { onClose: () => void }) {
  const { addServer } = useActions()
  const [url, setUrl] = React.useState('')
  const [description, setDescription] = React.useState('')
  return (
    <DraftRow
      submitLabel="Add server"
      canSubmit={url.trim() !== ''}
      onCancel={onClose}
      onSubmit={() => {
        addServer({ url: url.trim(), description: description.trim() || undefined })
        onClose()
      }}
    >
      <Input
        // The row appears because the user asked to add a server; start typing right away.
        // oxlint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        aria-label="New server URL"
        type="url"
        inputMode="url"
        placeholder="https://api.example.com/v1"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        className="h-7 font-mono text-[12.5px] @[40rem]:flex-[3]"
      />
      <Input
        aria-label="New server description"
        placeholder="Production"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        className="h-7 text-[13px] @[40rem]:flex-[2]"
      />
    </DraftRow>
  )
}

/** `/settings/servers`: base URLs. */
export function ServersSection() {
  const servers = useServers()
  const [adding, setAdding] = React.useState(false)
  return (
    <Panel
      title="Servers"
      icon={ServerIcon}
      count={servers.length}
      flush
      footer="Server variables are not editable yet."
    >
      {servers.length === 0 && !adding ? (
        <EmptyState
          size="panel"
          title="No servers yet."
          description="Add the base URLs your API is served from, like production and staging."
        />
      ) : (
        <ul aria-label="Servers" className="divide-y divide-border/70">
          {servers.map((server, index) => (
            // Servers have no id; the store addresses them by index too.
            // oxlint-disable-next-line react/no-array-index-key
            <ServerRow key={index} server={server} index={index} />
          ))}
        </ul>
      )}
      {adding ? (
        <AddServerRow onClose={() => setAdding(false)} />
      ) : (
        <PanelAddRow label="Add server" onClick={() => setAdding(true)} />
      )}
    </Panel>
  )
}
