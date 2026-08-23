import { createRoot } from 'react-dom/client';
import VerifyEmail from './VerifyEmail.jsx';
import './verify-email.css';

// Deliberately not wrapped in StrictMode: the page performs a one-shot,
// token-consuming POST on mount, and StrictMode's double-invoke would spend
// the token twice. See the `started` ref in VerifyEmail.jsx.
createRoot(document.getElementById('root')).render(<VerifyEmail />);
