import { WifiOff } from 'lucide-react'
import { MetaChip } from '@/components/shared'
import { useOnlineStatus } from '@/hooks/use-online-status'

/** Neutral: the editor works offline, so being offline is information, not a warning. */
export function OfflineBadge() {
  const online = useOnlineStatus()
  if (online) return null
  return (
    <MetaChip icon={WifiOff} title="Everything still works and saves in this browser.">
      Offline
    </MetaChip>
  )
}
