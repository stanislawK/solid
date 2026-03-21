import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider } from '@/components/auth-provider';
import { LandingPage } from '@/components/landing-page';

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <AuthProvider>
        <LandingPage />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;