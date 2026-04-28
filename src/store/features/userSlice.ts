import { UserData } from '@/interface/user';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

const getStoredApplication = () => {
    if (typeof window !== "undefined") {
        const saved = sessionStorage.getItem('selected_application');
        return saved ? JSON.parse(saved) : null;
    }
    return null;
};

interface UserState {
    data: UserData | null;
    isAuthenticated: boolean;
    selectedApplication: any | null; 
}

const initialState: UserState = {
    data: null,
    isAuthenticated: false,
    selectedApplication: getStoredApplication(),
};

const userSlice = createSlice({
    name: 'user',
    initialState,
    reducers: {
        setUserData: (state, action: PayloadAction<UserData>) => {
            state.data = action.payload;
            state.isAuthenticated = true;
        },
        setSelectedApplication: (state, action: PayloadAction<any>) => {
            state.selectedApplication = action.payload;
            if (typeof window !== "undefined") {
                sessionStorage.setItem('selected_application', JSON.stringify(action.payload));
            }
        },
        clearSelectedApplication: (state) => {
            state.selectedApplication = null;
            if (typeof window !== "undefined") {
                sessionStorage.removeItem('selected_application');
            }
        },
    },
});

export const { setUserData, setSelectedApplication, clearSelectedApplication } = userSlice.actions;
export default userSlice.reducer;