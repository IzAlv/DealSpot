import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Wheat } from 'lucide-react';

const BA_NAVY = '#1A5276';
const BA_GRAY = '#4A4A4A';

export default function LoginPage() {
  const { login, isAuthenticated, loading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (isAuthenticated) return <Navigate to="/trades" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const result = await login(username, password);
    if (!result.success) setError(result.error || 'Login failed');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <img src="/ba-ticaret-logo.png" alt="BA Ticaret" className="h-24 w-auto mx-auto object-contain" />
          </div>
          <CardTitle className="text-2xl" style={{ color: BA_NAVY }} data-testid="login-title">
            BA TiCARET
          </CardTitle>
          <CardDescription style={{ color: BA_GRAY }}>Agricultural Commodity Trading Dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" data-testid="login-username-input" placeholder="Enter username" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" data-testid="login-password-input" placeholder="Enter password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </div>
            {error && <p className="text-sm text-destructive" data-testid="login-error">{error}</p>}
            <Button type="submit" data-testid="login-submit-button" className="w-full bg-[#1A5276] hover:bg-[#143D5C]" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
          <div className="mt-6 rounded-lg bg-muted p-4" data-testid="login-demo-credentials">
            <p className="text-xs text-muted-foreground">
              <strong>Login credentials:</strong><br />
              Username: <code className="rounded bg-background px-1">izzet.alev</code><br />
              Password: <code className="rounded bg-background px-1">izzet123</code>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
