import { useApp } from '../context/AppContext.jsx';

export default function Toast() {
  const { toastState } = useApp();
  return (
    <div className={'toast' + (toastState.show ? ' show' : '')} id="toast">
      {toastState.msg}
    </div>
  );
}
