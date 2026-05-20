import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    stripeCustomerId: { type: String },
    stripeSubscriptionId: { type: String },
    subscriptionStatus: { type: String },
    tokens: { type: Number, default: 0 },
    productId: { type: String },
});

const User = mongoose.model("User", UserSchema);
export default User;
