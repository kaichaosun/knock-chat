import { useSyncExternalStore } from "react"

import { snapshot, subscribe, type Rooms } from "@/lib/rooms"

/**
 * Rooms this device has seen, including ones the relay no longer describes.
 *
 * An external store for the same reason the name directory is one: rooms are
 * learned in one place and drawn in several, and a thread has to keep its title
 * after the room behind it is gone.
 */
export function useRooms(): Rooms {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
