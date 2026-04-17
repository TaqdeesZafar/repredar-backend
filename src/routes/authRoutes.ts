import express from "express";
import { register, login, forgotPassword, resetPassword, guestToken } from "../controllers/authController";
import { check } from "express-validator";

const router = express.Router();

router.post("/register", [
    check("name", "Name is required").not().isEmpty(),
    check("email", "Please include a valid email").isEmail(),
    check("password", "Password must be 6 or more characters").isLength({ min: 6 }),
], register);

router.post("/login", login);

router.post("/forgot-password", [
    check("email", "Please include a valid email").isEmail(),
], forgotPassword);

router.post("/reset-password", [
    check("token", "Reset token is required").not().isEmpty(),
    check("password", "Password must be 6 or more characters").isLength({ min: 6 }),
], resetPassword);
router.post("/guest-token", guestToken);

export default router;
