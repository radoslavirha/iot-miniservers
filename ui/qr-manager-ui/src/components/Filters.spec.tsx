import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Filters } from './Filters.js';

describe('<Filters />', () => {
    it('renders the All option for both selects when no filter is set', () => {
        render(<Filters value={{}} onChange={vi.fn()} />);
        expect(screen.getAllByRole('option', { name: 'All' })).toHaveLength(2);
    });

    it('emits a type filter on change', async () => {
        const onChange = vi.fn();
        render(<Filters value={{}} onChange={onChange} />);
        await userEvent.selectOptions(screen.getByLabelText('Type'), 'iot-device');
        expect(onChange).toHaveBeenCalledWith({ type: 'iot-device' });
    });

    it('emits an active filter on change', async () => {
        const onChange = vi.fn();
        render(<Filters value={{}} onChange={onChange} />);
        await userEvent.selectOptions(screen.getByLabelText('Active'), 'true');
        expect(onChange).toHaveBeenCalledWith({ active: true });
    });

    it('clears the active filter when the All option is selected again', async () => {
        const onChange = vi.fn();
        render(<Filters value={{ active: false }} onChange={onChange} />);
        await userEvent.selectOptions(screen.getByLabelText('Active'), '');
        expect(onChange).toHaveBeenCalledWith({ active: undefined });
    });
});
