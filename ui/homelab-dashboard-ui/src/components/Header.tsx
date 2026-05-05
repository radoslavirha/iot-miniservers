import { useEffect, useState } from 'react';

interface Props {
    title: string;
    onSearch: (query: string) => void;
}

export function Header({ title, onSearch }: Props) {
    const [time, setTime] = useState('');
    const [query, setQuery] = useState('');

    useEffect(() => {
        const tick = () =>
            setTime(
                new Date().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                })
            );
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const input = document.getElementById('search') as HTMLInputElement | null;
            if (e.key === '/' && document.activeElement !== input) {
                e.preventDefault();
                input?.focus();
            }
            if (e.key === 'Escape') {
                setQuery('');
                onSearch('');
                input?.blur();
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onSearch]);

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        setQuery(e.target.value);
        onSearch(e.target.value);
    }

    return (
        <header>
            <div className="logo">
                ~/<span>{title}</span>
            </div>
            <input
                id="search"
                type="text"
                placeholder="Filter services…"
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={handleChange}
            />
            <div className="time">{time}</div>
        </header>
    );
}
