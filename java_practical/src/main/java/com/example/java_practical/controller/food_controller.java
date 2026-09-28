package com.example.java_practical.controller;

import com.example.java_practical.entity.food_entity.*;
import com.example.java_practical.service.food_service;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class food_controller {

    private final food_service service;

    public food_controller(food_service service) { this.service = service; }

    // Request bodies with validation
    public record ListingRequest(
            @NotNull(message = "donorId is required") Long donorId,
            @NotBlank(message = "foodType is required") String foodType,
            @NotNull(message = "quantity is required") @Positive(message = "quantity must be positive") Double quantity,
            @NotNull(message = "safeUntil is required") @Future(message = "safeUntil must be in the future") LocalDateTime safeUntil) {}

    public record ClaimRequest(@NotNull(message = "ngoId is required") Long ngoId) {}

    // ---------- Donors & NGOs ----------
    @PostMapping("/donors") @ResponseStatus(HttpStatus.CREATED)
    public Donor addDonor(@Valid @RequestBody Donor donor) { return service.addDonor(donor); }

    @GetMapping("/donors")
    public List<Donor> getDonors() { return service.getDonors(); }

    @PutMapping("/donors/{id}")
    public Donor updateDonor(@PathVariable Long id, @Valid @RequestBody Donor donor) {
        return service.updateDonor(id, donor);
    }

    @DeleteMapping("/donors/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteDonor(@PathVariable Long id) { service.deleteDonor(id); }

    @PostMapping("/ngos") @ResponseStatus(HttpStatus.CREATED)
    public NGO addNgo(@Valid @RequestBody NGO ngo) { return service.addNgo(ngo); }

    @GetMapping("/ngos")
    public List<NGO> getNgos() { return service.getNgos(); }

    @PutMapping("/ngos/{id}")
    public NGO updateNgo(@PathVariable Long id, @Valid @RequestBody NGO ngo) {
        return service.updateNgo(id, ngo);
    }

    @DeleteMapping("/ngos/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteNgo(@PathVariable Long id) { service.deleteNgo(id); }

    // ---------- Core features ----------
    @PostMapping("/listings") @ResponseStatus(HttpStatus.CREATED)                 // 1. donor lists food
    public FoodListing addListing(@Valid @RequestBody ListingRequest r) {
        return service.addListing(r.donorId(), r.foodType(), r.quantity(), r.safeUntil());
    }

    @GetMapping("/listings")                                                      // 2. NGO browses (page + sort)
    public List<food_service.ListingDetails> getListings(@RequestParam(defaultValue = "0") int page,
                                         @RequestParam(defaultValue = "10") int size,
                                         @RequestParam(defaultValue = "safeUntil") String sortBy) {
        return service.getListings(page, size, sortBy);
    }

    @PutMapping("/listings/{id}")
    public FoodListing updateListing(@PathVariable Long id, @Valid @RequestBody ListingRequest r) {
        return service.updateListing(id, r.donorId(), r.foodType(), r.quantity(), r.safeUntil());
    }

    @DeleteMapping("/listings/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteListing(@PathVariable Long id) { service.deleteListing(id); }

    @PostMapping("/listings/{id}/claim") @ResponseStatus(HttpStatus.CREATED)      // 2. NGO claims
    public Claim claim(@PathVariable Long id, @Valid @RequestBody ClaimRequest r) {
        return service.claim(id, r.ngoId());
    }

    @PutMapping("/listings/{id}/collect")                                         // 3. mark collected
    public FoodListing collect(@PathVariable Long id) { return service.collect(id); }

    @GetMapping("/reports/monthly")                                               // 5. monthly report
    public Map<String, Object> monthly(@RequestParam int year, @RequestParam int month) {
        return service.monthlyReport(year, month);
    }

    @GetMapping("/claims")
    public List<Claim> getClaims() { return service.getClaims(); }

    // ---------- Global exception handler ----------
    @RestControllerAdvice
    public static class ErrorHandler {

        @ExceptionHandler(food_service.NotFoundException.class)
        public ResponseEntity<Map<String, Object>> notFound(food_service.NotFoundException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        }

        @ExceptionHandler(food_service.BusinessException.class)
        public ResponseEntity<Map<String, Object>> rule(food_service.BusinessException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        }

        @ExceptionHandler(MethodArgumentNotValidException.class)
        public ResponseEntity<Map<String, Object>> validation(MethodArgumentNotValidException e) {
            Map<String, String> details = new HashMap<>();
            e.getBindingResult().getFieldErrors().forEach(f -> details.put(f.getField(), f.getDefaultMessage()));
            return ResponseEntity.badRequest().body(Map.of("error", "Validation failed", "details", details));
        }

        @ExceptionHandler({HttpMessageNotReadableException.class, IllegalArgumentException.class,
                MethodArgumentTypeMismatchException.class, MissingServletRequestParameterException.class})
        public ResponseEntity<Map<String, Object>> badRequest(Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", "Malformed or invalid request: " + e.getMessage()));
        }
    }
}
