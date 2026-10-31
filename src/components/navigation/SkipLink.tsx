'use client';
export function SkipLink(){return <a href="#main-content" className="skip-link" onClick={e=>{const main=Array.from(document.querySelectorAll('main')).find(el=>el.getClientRects().length>0);if(main){e.preventDefault();main.tabIndex=-1;main.focus();main.scrollIntoView({block:'start'});}}}>Skip to main content</a>;}
