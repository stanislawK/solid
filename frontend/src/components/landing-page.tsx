import { Leaf, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ModeToggle } from '@/components/mode-toggle';
import { useAuth } from '@/components/auth-provider';
import { Dashboard } from '@/components/dashboard';

export function LandingPage() {
  const { isLoggedIn, user, logout } = useAuth();
  
  const handleGoogleLogin = () => {
    // The backend uses /auth/login, exposed via Traefik likely at /api/auth/login 
    // or we just redirect directly based on our current proxy setup.
    window.location.href = '/api/auth/login';
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col transition-colors duration-300">
      {/* Header */}
      <header className="absolute top-0 w-full p-4 flex justify-between items-center">
        <div>
          {isLoggedIn && user && (
            <span className="text-sm font-medium text-muted-foreground mr-4">
              Witaj, {user.email}
            </span>
          )}
        </div>
        <div className="flex gap-4 items-center">
          {isLoggedIn && (
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="w-4 h-4 mr-2" /> Wyloguj
            </Button>
          )}
          <ModeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className={`flex-1 w-full max-w-7xl mx-auto flex flex-col items-center p-4 mt-16 ${!isLoggedIn ? 'justify-center' : 'justify-start'}`}>
        {isLoggedIn ? (
          <Dashboard />
        ) : (
          <Card className="max-w-md w-full border-border/40 shadow-xl bg-card">
          <CardHeader className="text-center space-y-4">
            <div className="flex justify-center mb-4">
              {/* Simple Plant Illustration adapting to light/dark modes */}
              <div className="relative w-40 h-40 flex items-center justify-center rounded-full bg-primary/10">
                <svg
                  viewBox="0 0 100 100"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-28 h-28"
                >
                  {/* Plant Main Stem and Leaves */}
                  <g className="text-primary" fill="currentColor">
                    {/* Stem */}
                    <path d="M50 70 Q 48 40 50 10 Q 52 40 50 70 Z" />
                    {/* Bottom Left Leaf */}
                    <path d="M49 58 Q 30 65 15 50 Q 30 40 49 53 Z" />
                    {/* Bottom Right Leaf */}
                    <path d="M51 52 Q 70 55 85 40 Q 70 30 51 47 Z" />
                    {/* Mid Left Leaf */}
                    <path d="M49 42 Q 35 45 20 25 Q 35 20 49 37 Z" />
                    {/* Mid Right Leaf */}
                    <path d="M50 32 Q 65 30 80 15 Q 65 10 50 27 Z" />
                    {/* Top Center Leaf */}
                    <path d="M50 15 Q 40 10 50 0 Q 60 10 50 15 Z" />
                  </g>
                  
                  {/* Pot Components */}
                  <g className="text-muted-foreground" fill="currentColor">
                    {/* Pot Rim */}
                    <rect x="25" y="65" width="50" height="8" rx="3" />
                    {/* Pot Base */}
                    <path d="M30 73 L70 73 L62 95 L38 95 Z" />
                  </g>
                </svg>
              </div>
            </div>
            <CardTitle className="text-2xl font-bold flex items-center justify-center gap-2">
              <Leaf className="text-primary" /> Roślinki
            </CardTitle>
            <CardDescription className="text-base text-muted-foreground">
              Twój nowoczesny, inteligentny asystent pielęgnacji roślin.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-4">
            <div className="flex flex-col gap-4">
              <Button 
                onClick={handleGoogleLogin} 
                className="w-full flex items-center gap-2 py-6 text-lg"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-5 h-5 bg-white rounded-full p-0.5"
                >
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                  <path d="M1 1h22v22H1z" fill="none" />
                </svg>
                Kontynuuj z Google
              </Button>
            </div>
            
            <p className="text-sm text-center text-muted-foreground mt-4">
              Kontynuując, akceptujesz nasz Regulamin i Politykę Prywatności.
            </p>
          </CardContent>
        </Card>
        )}
      </main>
    </div>
  );
}
