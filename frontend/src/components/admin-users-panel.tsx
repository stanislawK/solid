import { useEffect, useState } from 'react'
import { ShieldCheck, UserRound } from 'lucide-react'

import { useAuth } from '@/components/auth-provider'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

type AdminUser = {
  id: number
  email: string
  name: string
  picture?: string | null
  provider: string
  is_active: boolean
}

export function AdminUsersPanel() {
  const { token, user } = useAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [pendingEmails, setPendingEmails] = useState<string[]>([])

  useEffect(() => {
    if (!token || !user?.is_admin) {
      setUsers([])
      setIsLoading(false)
      return
    }

    let isCancelled = false

    const loadUsers = async () => {
      setIsLoading(true)

      try {
        const response = await fetch('/api/auth/users', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (response.status === 403) {
          if (!isCancelled) {
            setUsers([])
          }
          return
        }

        if (!response.ok) {
          throw new Error('Failed to fetch users')
        }

        const data: unknown = await response.json()

        if (!isCancelled) {
          setUsers(Array.isArray(data) ? (data as AdminUser[]) : [])
        }
      } catch (error) {
        console.error('Failed to load admin users panel', error)
        if (!isCancelled) {
          setUsers([])
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadUsers()

    return () => {
      isCancelled = true
    }
  }, [token, user?.is_admin])

  const toggleUserAccess = async (selectedUser: AdminUser, shouldBeActive: boolean) => {
    setPendingEmails((current) => [...current, selectedUser.email])

    try {
      const endpoint = shouldBeActive ? 'activate' : 'deactivate'
      const response = await fetch(`/api/auth/${endpoint}?email=${encodeURIComponent(selectedUser.email)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to update user status')
      }

      setUsers((current) =>
        current.map((entry) =>
          entry.email === selectedUser.email
            ? { ...entry, is_active: shouldBeActive }
            : entry
        )
      )
    } catch (error) {
      console.error('Failed to update user status', error)
    } finally {
      setPendingEmails((current) => current.filter((email) => email !== selectedUser.email))
    }
  }

  if (!user?.is_admin || isLoading) {
    return null
  }

  return (
    <Card className="w-full border-border/60 bg-card/95 shadow-sm backdrop-blur">
      <CardHeader className="gap-2 border-b border-border/60 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <CardTitle>Zarządzanie użytkownikami</CardTitle>
            <CardDescription>
              Lista kont z przełącznikiem aktywacji dostępnym tylko dla administratora.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {users.map((entry) => {
          const isCurrentAdmin = user?.email === entry.email
          const isPending = pendingEmails.includes(entry.email)

          return (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-background/70 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                {entry.picture ? (
                  <img
                    src={entry.picture}
                    alt={entry.name}
                    className="size-11 rounded-full object-cover ring-1 ring-border"
                  />
                ) : (
                  <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <UserRound className="size-5" />
                  </div>
                )}

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{entry.name}</p>
                    {isCurrentAdmin && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        Admin
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{entry.email}</p>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/80">
                    {entry.provider}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {entry.is_active ? 'Aktywny' : 'Nieaktywny'}
                </span>
                <Switch
                  aria-label={`Przełącz aktywność użytkownika ${entry.email}`}
                  checked={entry.is_active}
                  disabled={isPending || isCurrentAdmin}
                  onCheckedChange={(checked) => {
                    void toggleUserAccess(entry, checked)
                  }}
                />
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}