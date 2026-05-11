type SubmitModalProps = {
    isSubmitModalOpen: boolean;
    submitContent: string;
    setSubmitContent: (content: string) => void;
    handleCancelSubmit: () => void;
    handleConfirmSubmit: () => void;
};

export function SubmitModal({
    isSubmitModalOpen,
    submitContent,
    setSubmitContent,
    handleCancelSubmit,
    handleConfirmSubmit,
}: SubmitModalProps) {
    if (!isSubmitModalOpen) return null;

    const textAreaStyle = {
        width: "100%",
        marginTop: 8,
        padding: "8px 10px",
        borderRadius: 6,
        border: "1px solid #334155",
        background: "#0b1220",
        color: "white",
        boxSizing: "border-box",
        fontSize: 13,
        outline: "none",
        resize: "vertical",
        fontFamily: "inherit",
        height: 100,
    } as const;

    return (
        <div style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000
        }}>
            <div style={{
                background: "#0b1220",
                padding: 20,
                borderRadius: 8,
                border: "1px solid #334155",
                width: 400,
                color: "white"
            }}>
                <h3 style={{ marginTop: 0 }}>Nội dung Submit</h3>
                <textarea
                    value={submitContent}
                    onChange={(e) => setSubmitContent(e.target.value)}
                    placeholder="Nhập nội dung submit..."
                    style={textAreaStyle}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 15 }}>
                    <button onClick={handleCancelSubmit} style={{ padding: "8px 16px", borderRadius: 6, cursor: "pointer", border: "1px solid #334155", background: "transparent", color: "white" }}>Hủy</button>
                    <button onClick={handleConfirmSubmit} style={{ padding: "8px 16px", borderRadius: 6, cursor: "pointer", border: "none", background: "#16a34a", color: "white", fontWeight: "bold" }}>Gửi Submit</button>
                </div>
            </div>
        </div>
    );
}
