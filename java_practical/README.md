# FoodShare – Surplus Food Donation Matching Platform

Spring Boot 4 · Spring Web · Spring Data JPA · Validation · MySQL · JDK 17

## Run
1. Start MySQL (the `foodshare` database is created automatically).
2. Set the password in `src/main/resources/application.properties` or via the `DB_PASSWORD` environment variable.
3. Run `JavaPracticalApplication` in IntelliJ, then open http://localhost:8080

## Architecture (layers)
| Layer | File |
|---|---|
| Entity | `entity/food_entity.java` – Donor, NGO, FoodListing, Claim |
| Repository | `repository/food_repository.java` – Spring Data JPA interfaces |
| Service | `service/food_service.java` – business rules, auto-expiry, notifications |
| Controller | `controller/food_controller.java` – REST endpoints, validation, `@RestControllerAdvice` |
| UI | `static/index.html`, `javascript.js`, `style.css` |

## Website workflow
1. **Register** donors and NGOs
2. **Donate** – donor lists food with type, quantity and safe-to-eat-until time
3. **Claim** – NGO claims an available listing (rules enforced in the service layer)
4. **Collect** – mark the claimed listing as picked up
5. **Impact** – monthly kg diverted from waste, plus a paginated and sortable history

## Business rules (enforced in `food_service.claim`)
* A listing past its safe-to-eat-until time cannot be claimed (HTTP 409).
* Only one NGO can hold an active claim on a listing (HTTP 409).
* Unclaimed listings are auto-expired by a `@Scheduled` job every 30 seconds.

## 2-minute demo script
1. Register one donor and two NGOs.
2. Donate "Rice" with **+4 hrs**, then "Bread" with **+2 min (demo)**.
3. Claim Rice as NGO 1, then try to claim it again as NGO 2 (clear error shown).
4. Wait for Bread's countdown to reach zero and watch it become **Expired**; the console prints `[NOTIFICATION]` lines.
5. Collect Rice in step 4, then open step 5 to show the monthly total.
6. Leave a field empty and submit to show the validation messages.
