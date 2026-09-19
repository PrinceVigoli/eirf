import { Router } from "express";
import health from "./health";
import auth from "./auth";
import incidents from "./incidents";
import evidence from "./evidence";
import officers from "./officers";
import persons from "./persons";
import dashboard from "./dashboard";
import logs from "./logs";
import storage from "./storage";
import system from "./system";

const router = Router();

router.use(health);
router.use(auth);
router.use(incidents);
router.use(evidence);
router.use(officers);
router.use(persons);
router.use(dashboard);
router.use(logs);
router.use(storage);
router.use(system);

export default router;
