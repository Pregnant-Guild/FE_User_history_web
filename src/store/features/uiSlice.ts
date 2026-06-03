import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface UiState {
    mapEntered: boolean;
}

const initialState: UiState = {
    mapEntered: false,
};

const uiSlice = createSlice({
    name: 'ui',
    initialState,
    reducers: {
        setMapEntered: (state, action: PayloadAction<boolean>) => {
            state.mapEntered = action.payload;
        },
    },
});

export const { setMapEntered } = uiSlice.actions;
export default uiSlice.reducer;
