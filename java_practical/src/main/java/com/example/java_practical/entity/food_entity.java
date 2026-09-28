package com.example.java_practical.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import java.time.LocalDateTime;
import java.util.List;

public class food_entity {

    public enum ListingStatus { AVAILABLE, CLAIMED, COLLECTED, EXPIRED }
    public enum ClaimStatus { ACTIVE, COLLECTED }

    // Donor 1 --- * FoodListing
    @Entity(name = "Donor")
    @Table(name = "donors")
    public static class Donor {
        @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
        public Long id;
        @NotBlank(message = "Donor name is required")
        public String name;
        public String contact;
        @OneToMany(mappedBy = "donor") @JsonIgnore
        public List<FoodListing> listings;
    }

    // NGO 1 --- * Claim
    @Entity(name = "NGO")
    @Table(name = "ngos")
    public static class NGO {
        @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
        public Long id;
        @NotBlank(message = "NGO name is required")
        public String name;
        public String contact;
        @OneToMany(mappedBy = "ngo") @JsonIgnore
        public List<Claim> claims;
    }

    // FoodListing * --- 1 Donor, FoodListing 1 --- * Claim
    @Entity(name = "FoodListing")
    @Table(name = "food_listings")
    public static class FoodListing {
        @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
        public Long id;
        @ManyToOne(optional = false) @JoinColumn(name = "donor_id")
        public Donor donor;
        public String foodType;
        public Double quantity;              // in kg
        public LocalDateTime safeUntil;      // safe-to-eat-until time
        @Enumerated(EnumType.STRING)
        public ListingStatus status = ListingStatus.AVAILABLE;
        public LocalDateTime collectedAt;
        @OneToMany(mappedBy = "listing") @JsonIgnore
        public List<Claim> claims;
    }

    // Claim: an NGO claims a FoodListing
    @Entity(name = "Claim")
    @Table(name = "claims")
    public static class Claim {
        @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
        public Long id;
        @ManyToOne(optional = false) @JoinColumn(name = "listing_id")
        public FoodListing listing;
        @ManyToOne(optional = false) @JoinColumn(name = "ngo_id")
        public NGO ngo;
        public LocalDateTime claimedAt;
        @Enumerated(EnumType.STRING)
        public ClaimStatus status = ClaimStatus.ACTIVE;
    }
}